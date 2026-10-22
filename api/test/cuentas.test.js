// Tipos de cuenta, Mi cuenta, administración de usuarios, fincas y reglas de integridad.
// Cada respuesta se valida además contra api/openapi.yaml con cumpleContrato().
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { preparar, token, cumpleContrato, PREFIJO, CORREOS, CONTRASENA, IDS } from './ayuda.js';

let app; let pool; let cerrar; let tAdmin; let tHernando; let tLuz;
const pedir = (method, ruta, { t, payload } = {}) =>
  app.inject({ method, url: `${PREFIJO}${ruta}`, payload, headers: t ? { authorization: `Bearer ${t}` } : {} });
const ingresar = (correo, contrasena = CONTRASENA) => pedir('POST', '/auth/ingreso', { payload: { correo, contrasena } });
const campos = (r) => r.json().detalles.map((d) => d.campo).sort();

const EMPRESA = {
  tipo_persona: 'juridica', tipo_documento: 'NIT', numero_documento: '900.123.456-8', representante_legal: 'Martha Lucía Rojas',
  nombre_completo: 'Ganadería El Totumo S.A.S.', correo: 'gerencia@eltotumo.com.co', contrasena: 'totumo-pore-2026',
  municipio: 'Pore', vereda: 'El Banco', acepta_tratamiento_datos: true,
};
const PERSONA = {
  tipo_persona: 'natural', tipo_documento: 'CC', numero_documento: '1118560777', nombre_completo: 'Jhon Fredy Avella',
  correo: 'jhon.avella@correo.co', contrasena: 'avella-nunchia-2026', municipio: 'Nunchía', acepta_tratamiento_datos: true,
};

before(async () => {
  ({ app, pool, cerrar } = await preparar());
  [tAdmin, tHernando, tLuz] = await Promise.all([token(app, CORREOS.admin), token(app, CORREOS.hernando), token(app, CORREOS.luz)]);
});
after(async () => cerrar());

describe('Registro como persona o como empresa', () => {
  test('una empresa con NIT mal digitado recibe 422 que explica el dígito de verificación', async () => {
    const r = await pedir('POST', '/auth/registro', { payload: { ...EMPRESA, numero_documento: '900123456-1' } });
    const cuerpo = cumpleContrato('registrarUsuario', r);
    assert.equal(r.statusCode, 422);
    assert.match(cuerpo.detalles[0].problema, /debe ser 8/);
  });
  test('una empresa sin representante legal, o con cédula, recibe 422', async () => {
    const { representante_legal: _, ...sinRep } = EMPRESA;
    const r = await pedir('POST', '/auth/registro', { payload: { ...sinRep, tipo_documento: 'CC', numero_documento: '74000111' } });
    cumpleContrato('registrarUsuario', r);
    assert.deepEqual(campos(r), ['representante_legal', 'tipo_documento']);
  });
  test('sin aceptar el tratamiento de datos, o con un municipio que no es de Casanare, recibe 422', async () => {
    const r = await pedir('POST', '/auth/registro', { payload: { ...PERSONA, acepta_tratamiento_datos: false, municipio: 'Sogamoso' } });
    cumpleContrato('registrarUsuario', r);
    assert.deepEqual(campos(r), ['acepta_tratamiento_datos', 'municipio']);
  });
  test('la empresa se registra; el NIT queda normalizado y sin verificar', async () => {
    const r = await pedir('POST', '/auth/registro', { payload: EMPRESA });
    cumpleContrato('registrarUsuario', r);
    assert.equal(r.statusCode, 201);
    const yo = cumpleContrato('obtenerUsuarioActual', await pedir('GET', '/auth/yo', { t: r.json().token }));
    assert.equal(yo.productor.tipo_persona, 'juridica');
    assert.equal(yo.productor.numero_documento, '900123456-8');
    assert.equal(yo.productor.documento_verificado, false);
    assert.ok(yo.productor.acepta_datos_en);
  });
  test('un documento ya registrado responde 409, aunque el correo sea otro', async () => {
    const r = await pedir('POST', '/auth/registro', { payload: { ...PERSONA, numero_documento: '74852369' } });
    cumpleContrato('registrarUsuario', r);
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().detalles[0].campo, 'numero_documento');
  });
});

describe('Mi cuenta', () => {
  let tPersona;
  before(async () => {
    tPersona = (await pedir('POST', '/auth/registro', { payload: PERSONA })).json().token;
  });
  test('actualiza su vereda y celular; la respuesta trae la ficha completa', async () => {
    const r = await pedir('PATCH', '/auth/yo', { t: tHernando, payload: { vereda: 'El Charte', telefono: '3124587700' } });
    const yo = cumpleContrato('actualizarPerfil', r);
    assert.equal(yo.productor.vereda, 'El Charte');
  });
  test('un documento verificado no lo puede cambiar el productor (409)', async () => {
    const r = await pedir('PATCH', '/auth/yo', { t: tHernando, payload: { numero_documento: '74852360' } });
    cumpleContrato('actualizarPerfil', r);
    assert.equal(r.statusCode, 409);
  });
  test('cambiar el correo cambia el de la cuenta y el de la ficha, y con él se ingresa', async () => {
    const yo = cumpleContrato('actualizarPerfil', await pedir('PATCH', '/auth/yo', { t: tPersona, payload: { correo: 'jhon.f.avella@correo.co' } }));
    assert.equal(yo.correo, 'jhon.f.avella@correo.co');
    assert.equal(yo.productor.correo, 'jhon.f.avella@correo.co');
    assert.equal((await ingresar('jhon.f.avella@correo.co', PERSONA.contrasena)).statusCode, 200);
    const ocupado = await pedir('PATCH', '/auth/yo', { t: tPersona, payload: { correo: CORREOS.luz } });
    cumpleContrato('actualizarPerfil', ocupado);
    assert.equal(ocupado.statusCode, 409);
  });
  test('cambiar la contraseña exige la actual', async () => {
    const mal = await pedir('POST', '/auth/contrasena', { t: tPersona, payload: { contrasena_actual: 'no-es-esta-123', contrasena_nueva: 'otra-clave-nueva-1' } });
    cumpleContrato('cambiarContrasena', mal);
    assert.equal(mal.statusCode, 422);
    const bien = await pedir('POST', '/auth/contrasena', { t: tPersona, payload: { contrasena_actual: PERSONA.contrasena, contrasena_nueva: 'otra-clave-nueva-1' } });
    cumpleContrato('cambiarContrasena', bien);
    assert.equal(bien.statusCode, 204);
    assert.equal((await ingresar('jhon.f.avella@correo.co', 'otra-clave-nueva-1')).statusCode, 200);
  });
  test('eliminar la cuenta sin lotes borra la cuenta y la ficha', async () => {
    const yo = (await pedir('GET', '/auth/yo', { t: tPersona })).json();
    const mal = await pedir('DELETE', '/auth/yo', { t: tPersona, payload: { contrasena: 'equivocada-999' } });
    cumpleContrato('eliminarCuenta', mal);
    assert.equal(mal.statusCode, 422);
    const r = await pedir('DELETE', '/auth/yo', { t: tPersona, payload: { contrasena: 'otra-clave-nueva-1' } });
    cumpleContrato('eliminarCuenta', r);
    assert.equal(r.statusCode, 204);
    assert.equal((await pool.query('SELECT 1 FROM productor WHERE id = $1', [yo.productor_id])).rowCount, 0);
    assert.equal((await pedir('GET', '/auth/yo', { t: tPersona })).statusCode, 401, 'el token deja de servir');
  });
});

describe('Administración de usuarios', () => {
  test('solo el administrador lista usuarios; busca por documento', async () => {
    const negado = await pedir('GET', '/usuarios', { t: tHernando });
    cumpleContrato('listarUsuarios', negado);
    assert.equal(negado.statusCode, 403);
    const r = cumpleContrato('listarUsuarios', await pedir('GET', '/usuarios?q=74852369', { t: tAdmin }));
    assert.deepEqual(r.datos.map((u) => u.productor_id), [IDS.hernando]);
  });
  test('crea una cuenta de productor con contraseña inicial: debe cambiarla antes de usar el sistema', async () => {
    const r = await pedir('POST', '/usuarios', { t: tAdmin, payload: {
      rol: 'productor', nombre_completo: 'Ana Belén Cusiana', correo: 'ana.cusiana@correo.co', contrasena: 'inicial-ana-2026',
      tipo_persona: 'natural', tipo_documento: 'CE', numero_documento: '6123456', municipio: 'Villanueva' } });
    const u = cumpleContrato('crearUsuario', r);
    assert.equal(r.statusCode, 201);
    assert.equal(u.debe_cambiar_contrasena, true);
    const t = (await ingresar('ana.cusiana@correo.co', 'inicial-ana-2026')).json().token;
    const bloqueada = await pedir('GET', '/lotes', { t });
    assert.equal(bloqueada.statusCode, 403);
    assert.match(bloqueada.json().mensaje, /contraseña temporal/);
    assert.equal((await pedir('GET', '/auth/yo', { t })).statusCode, 200);
    await pedir('POST', '/auth/contrasena', { t, payload: { contrasena_actual: 'inicial-ana-2026', contrasena_nueva: 'propia-de-ana-2026' } });
    assert.equal((await pedir('GET', '/lotes', { t })).statusCode, 200);
  });
  test('una cuenta de productor sin datos de la ficha responde 422', async () => {
    const r = await pedir('POST', '/usuarios', { t: tAdmin, payload: { rol: 'productor', nombre_completo: 'Sin ficha', correo: 'sin.ficha@correo.co', contrasena: 'inicial-1234' } });
    cumpleContrato('crearUsuario', r);
    assert.equal(r.statusCode, 422);
  });
  test('suspender una cuenta la saca de inmediato, aunque su token siga vigente', async () => {
    const { rows: [luz] } = await pool.query('SELECT id FROM usuario WHERE productor_id = $1', [IDS.luz]);
    const r = await pedir('PATCH', `/usuarios/${luz.id}`, { t: tAdmin, payload: { activo: false } });
    assert.equal(cumpleContrato('actualizarUsuario', r).activo, false);
    assert.equal((await pedir('GET', '/lotes', { t: tLuz })).statusCode, 401);
    const ingreso = await ingresar(CORREOS.luz);
    cumpleContrato('iniciarSesion', ingreso);
    assert.equal(ingreso.statusCode, 403);
    await pedir('PATCH', `/usuarios/${luz.id}`, { t: tAdmin, payload: { activo: true } });
    assert.equal((await pedir('GET', '/lotes', { t: tLuz })).statusCode, 200);
  });
  test('un cambio de rol se aplica de inmediato con el mismo token', async () => {
    const { rows: [luz] } = await pool.query('SELECT id FROM usuario WHERE productor_id = $1', [IDS.luz]);
    assert.equal((await pedir('GET', '/usuarios', { t: tLuz })).statusCode, 403);
    await pedir('PATCH', `/usuarios/${luz.id}`, { t: tAdmin, payload: { rol: 'administrador' } });
    assert.equal((await pedir('GET', '/usuarios', { t: tLuz })).statusCode, 200);
    await pedir('PATCH', `/usuarios/${luz.id}`, { t: tAdmin, payload: { rol: 'productor' } });
    assert.equal((await pedir('GET', '/usuarios', { t: tLuz })).statusCode, 403);
  });
  test('el sistema nunca queda sin administrador', async () => {
    const { rows: [admin] } = await pool.query("SELECT id FROM usuario WHERE rol = 'administrador'");
    const rol = await pedir('PATCH', `/usuarios/${admin.id}`, { t: tAdmin, payload: { rol: 'productor' } });
    cumpleContrato('actualizarUsuario', rol);
    assert.equal(rol.statusCode, 409);
    assert.equal((await pedir('PATCH', `/usuarios/${admin.id}`, { t: tAdmin, payload: { activo: false } })).statusCode, 409);
    assert.equal((await pedir('DELETE', `/usuarios/${admin.id}`, { t: tAdmin })).statusCode, 409);
    const propia = await pedir('DELETE', '/auth/yo', { t: tAdmin, payload: { contrasena: CONTRASENA } });
    cumpleContrato('eliminarCuenta', propia);
    assert.equal(propia.statusCode, 409);
  });
  test('restablecer la contraseña entrega una temporal de un solo uso', async () => {
    const { rows: [luz] } = await pool.query('SELECT id FROM usuario WHERE productor_id = $1', [IDS.luz]);
    const r = cumpleContrato('restablecerContrasena', await pedir('POST', `/usuarios/${luz.id}/contrasena-temporal`, { t: tAdmin }));
    const ingreso = cumpleContrato('iniciarSesion', await ingresar(CORREOS.luz, r.contrasena_temporal));
    assert.equal(ingreso.usuario.debe_cambiar_contrasena, true);
    assert.equal((await ingresar(CORREOS.luz)).statusCode, 401, 'la anterior ya no sirve');
    // Se deja la contraseña de pruebas de antes, para las pruebas siguientes.
    await pool.query(`UPDATE usuario SET debe_cambiar_contrasena = false,
      contrasena_hash = (SELECT contrasena_hash FROM usuario WHERE productor_id = $2) WHERE id = $1`, [luz.id, IDS.hernando]);
  });
  test('una cuenta con lotes no se elimina (409): se suspende', async () => {
    const { rows: [h] } = await pool.query('SELECT id FROM usuario WHERE productor_id = $1', [IDS.hernando]);
    const r = await pedir('DELETE', `/usuarios/${h.id}`, { t: tAdmin });
    cumpleContrato('eliminarUsuario', r);
    assert.equal(r.statusCode, 409);
  });
  test('el administrador verifica el documento de una empresa; el productor no puede', async () => {
    const empresa = (await pool.query("SELECT id FROM productor WHERE tipo_persona = 'juridica' LIMIT 1")).rows[0].id;
    const propio = await pedir('PATCH', `/productores/${IDS.hernando}`, { t: tHernando, payload: { documento_verificado: false } });
    cumpleContrato('actualizarProductor', propio);
    assert.equal(propio.statusCode, 403);
    const r = await pedir('PATCH', `/productores/${empresa}`, { t: tAdmin, payload: { documento_verificado: true } });
    assert.equal(cumpleContrato('actualizarProductor', r).documento_verificado, true);
  });
  test('resumen y bitácora: solo administradores; la bitácora registra lo hecho', async () => {
    assert.equal((await pedir('GET', '/admin/resumen', { t: tHernando })).statusCode, 403);
    const resumen = cumpleContrato('obtenerResumen', await pedir('GET', '/admin/resumen', { t: tAdmin }));
    assert.ok(resumen.usuarios.administradores >= 1);
    assert.ok(resumen.productores.empresas >= 1);
    const b = cumpleContrato('listarBitacora', await pedir('GET', '/bitacora?por_pagina=100', { t: tAdmin }));
    const acciones = new Set(b.datos.map((e) => e.accion));
    for (const a of ['registrar', 'crear', 'suspender', 'reactivar', 'cambiar_rol', 'restablecer_contrasena', 'verificar_documento', 'eliminar']) {
      assert.ok(acciones.has(a), `falta ${a} en la bitácora`);
    }
    assert.ok(!JSON.stringify(b).includes('contrasena_temporal'), 'nunca guarda contraseñas');
  });
});

describe('Fincas y lotes', () => {
  let finca;
  test('un productor registra su finca con ubicación', async () => {
    const r = await pedir('POST', '/fincas', { t: tHernando, payload: { nombre: 'Finca El Morichal', municipio: 'Yopal', vereda: 'Morichal', ubicacion: { type: 'Point', coordinates: [-72.35, 5.30] }, area_ha: 320 } });
    finca = cumpleContrato('crearFinca', r);
    assert.equal(r.statusCode, 201);
    assert.equal(finca.productor_id, IDS.hernando);
    assert.equal(finca.lotes, 0);
  });
  test('nombre repetido (409) y ubicación lejos del municipio (422)', async () => {
    const repetida = await pedir('POST', '/fincas', { t: tHernando, payload: { nombre: 'finca el morichal', municipio: 'Yopal' } });
    cumpleContrato('crearFinca', repetida);
    assert.equal(repetida.statusCode, 409);
    const lejos = await pedir('POST', '/fincas', { t: tHernando, payload: { nombre: 'Finca en Antioquia', municipio: 'Yopal', ubicacion: { type: 'Point', coordinates: [-75.57, 6.25] } } });
    cumpleContrato('crearFinca', lejos);
    assert.equal(lejos.statusCode, 422);
    assert.equal(lejos.json().detalles[0].campo, 'ubicacion');
  });
  test('otro productor no ve la finca, ni puede usarla en sus lotes', async () => {
    const ver = await pedir('GET', `/fincas/${finca.id}`, { t: tLuz });
    cumpleContrato('obtenerFinca', ver);
    assert.equal(ver.statusCode, 403);
    const lote = await pedir('POST', '/lotes', { t: tLuz, payload: { finca_id: finca.id, nombre: 'Vacas de Luz', cantidad_animales: 8, peso_promedio_kg: 420, categoria: 'vaca_gorda' } });
    cumpleContrato('crearLote', lote);
    assert.equal(lote.statusCode, 422);
    const lista = cumpleContrato('listarFincas', await pedir('GET', '/fincas', { t: tLuz }));
    assert.ok(lista.datos.every((f) => f.productor_id === IDS.luz));
  });
  test('el lote toma el nombre y el municipio de la finca, y los sigue si la finca cambia', async () => {
    const lote = cumpleContrato('crearLote', await pedir('POST', '/lotes', { t: tHernando, payload: { finca_id: finca.id, nombre: 'Novillos del Morichal', cantidad_animales: 12, peso_promedio_kg: 440, categoria: 'novillo_gordo' } }));
    assert.equal(lote.finca, 'Finca El Morichal');
    assert.equal(lote.municipio_origen, 'Yopal');
    const cambio = await pedir('PATCH', `/fincas/${finca.id}`, { t: tHernando, payload: { municipio: 'Aguazul', ubicacion: { type: 'Point', coordinates: [-72.55, 5.17] } } });
    assert.equal(cumpleContrato('actualizarFinca', cambio).lotes, 1);
    const despues = cumpleContrato('obtenerLote', await pedir('GET', `/lotes/${lote.id}`, { t: tHernando }));
    assert.equal(despues.municipio_origen, 'Aguazul');
    const directo = await pedir('PATCH', `/lotes/${lote.id}`, { t: tHernando, payload: { municipio_origen: 'Maní' } });
    cumpleContrato('actualizarLote', directo);
    assert.equal(directo.statusCode, 422);
  });
  test('una finca con lotes no se elimina (409); desactivada no recibe lotes nuevos', async () => {
    const borrar = await pedir('DELETE', `/fincas/${finca.id}`, { t: tHernando });
    cumpleContrato('eliminarFinca', borrar);
    assert.equal(borrar.statusCode, 409);
    await pedir('PATCH', `/fincas/${finca.id}`, { t: tHernando, payload: { activo: false } });
    const nuevo = await pedir('POST', '/lotes', { t: tHernando, payload: { finca_id: finca.id, nombre: 'Otro lote', cantidad_animales: 5, peso_promedio_kg: 400, categoria: 'vaca_gorda' } });
    assert.equal(nuevo.statusCode, 422);
  });
  test('una finca sin lotes se elimina (204)', async () => {
    const f = cumpleContrato('crearFinca', await pedir('POST', '/fincas', { t: tHernando, payload: { nombre: 'Lote de paso', municipio: 'Yopal' } }));
    const r = await pedir('DELETE', `/fincas/${f.id}`, { t: tHernando });
    cumpleContrato('eliminarFinca', r);
    assert.equal(r.statusCode, 204);
  });
  test('un lote sin finca ni municipio responde 422', async () => {
    const r = await pedir('POST', '/lotes', { t: tHernando, payload: { nombre: 'Sin origen', cantidad_animales: 5, peso_promedio_kg: 400, categoria: 'vaca_gorda' } });
    cumpleContrato('crearLote', r);
    assert.equal(r.statusCode, 422);
  });
});

describe('Derecho de supresión con historia', () => {
  test('quien tiene lotes elimina su cuenta: la ficha queda anónima y los lotes se conservan', async () => {
    const { rows: [antes] } = await pool.query('SELECT count(*) AS n FROM lote WHERE productor_id = $1', [IDS.luz]);
    const r = await pedir('DELETE', '/auth/yo', { t: tLuz, payload: { contrasena: CONTRASENA } });
    cumpleContrato('eliminarCuenta', r);
    assert.equal(r.statusCode, 204);
    const { rows: [p] } = await pool.query('SELECT nombre_completo, correo, numero_documento FROM productor WHERE id = $1', [IDS.luz]);
    assert.deepEqual(p, { nombre_completo: 'Productor retirado', correo: null, numero_documento: null });
    const { rows: [despues] } = await pool.query('SELECT count(*) AS n FROM lote WHERE productor_id = $1', [IDS.luz]);
    assert.equal(despues.n, antes.n);
    assert.equal((await ingresar(CORREOS.luz)).statusCode, 401);
  });
});

describe('¿Olvidó su contraseña? (solicitud al administrador)', () => {
  const pedirRecuperacion = (correo, numero) => pedir('POST', '/auth/recuperacion', { payload: { correo, numero_documento: numero } });
  test('responde igual exista o no la cuenta, y solo crea la solicitud si correo y documento coinciden', async () => {
    const bien = await pedirRecuperacion(CORREOS.hernando, '74.852.369');
    const mal = await pedirRecuperacion(CORREOS.hernando, '11111111');
    const nadie = await pedirRecuperacion('nadie@correo.co', '74852369');
    for (const r of [bien, mal, nadie]) { cumpleContrato('solicitarRecuperacion', r); assert.equal(r.statusCode, 202); }
    assert.equal(bien.json().mensaje, nadie.json().mensaje);
    const { rows } = await pool.query("SELECT count(*) AS n FROM solicitud_contrasena WHERE estado = 'pendiente'");
    assert.equal(rows[0].n, 1);
    await pedirRecuperacion(CORREOS.hernando, '74852369');
    const otra = await pool.query("SELECT count(*) AS n FROM solicitud_contrasena WHERE estado = 'pendiente'");
    assert.equal(otra.rows[0].n, 1, 'una sola pendiente por cuenta');
  });
  test('el productor no ve las solicitudes; el administrador las atiende y la temporal funciona', async () => {
    assert.equal((await pedir('GET', '/solicitudes-contrasena', { t: tHernando })).statusCode, 403); // Luz ya eliminó su cuenta más arriba
    const lista = cumpleContrato('listarSolicitudesContrasena', await pedir('GET', '/solicitudes-contrasena?estado=pendiente', { t: tAdmin }));
    assert.equal(lista.datos[0].usuario.correo, CORREOS.hernando);
    const resumen = cumpleContrato('obtenerResumen', await pedir('GET', '/admin/resumen', { t: tAdmin }));
    assert.equal(resumen.usuarios.solicitudes_pendientes, 1);
    const r = cumpleContrato('atenderSolicitudContrasena', await pedir('POST', `/solicitudes-contrasena/${lista.datos[0].id}/atender`, { t: tAdmin }));
    const ingreso = cumpleContrato('iniciarSesion', await ingresar(CORREOS.hernando, r.contrasena_temporal));
    assert.equal(ingreso.usuario.debe_cambiar_contrasena, true);
    const otraVez = await pedir('POST', `/solicitudes-contrasena/${lista.datos[0].id}/atender`, { t: tAdmin });
    cumpleContrato('atenderSolicitudContrasena', otraVez);
    assert.equal(otraVez.statusCode, 409);
  });
  test('una solicitud se puede descartar', async () => {
    await pool.query("UPDATE usuario SET debe_cambiar_contrasena = false WHERE productor_id = $1", [IDS.hernando]);
    await pedirRecuperacion(CORREOS.hernando, '74852369');
    const { rows: [s] } = await pool.query("SELECT id FROM solicitud_contrasena WHERE estado = 'pendiente'");
    const r = await pedir('POST', `/solicitudes-contrasena/${s.id}/descartar`, { t: tAdmin });
    cumpleContrato('descartarSolicitudContrasena', r);
    assert.equal(r.statusCode, 204);
    const b = cumpleContrato('listarBitacora', await pedir('GET', '/bitacora?por_pagina=100', { t: tAdmin }));
    assert.ok(b.datos.some((e) => e.accion === 'solicitar_contrasena'));
    assert.ok(b.datos.some((e) => e.accion === 'descartar_solicitud'));
  });
});
