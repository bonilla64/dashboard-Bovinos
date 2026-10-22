// Pruebas de integración contra PostgreSQL + PostGIS reales.
// Cada respuesta se valida además contra api/openapi.yaml con cumpleContrato().
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { preparar, token, cumpleContrato, PREFIJO, CORREOS, IDS } from './ayuda.js';
import { construirApp } from '../src/app.js';
import { config } from './ayuda.js';

const HOY = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
let app; let pool; let cerrar; let tAdmin; let tHernando; let tLuz;
const CC = (numero) => ({ tipo_persona: 'natural', tipo_documento: 'CC', numero_documento: numero });
const auth = (t) => ({ authorization: `Bearer ${t}` });
const pedir = (method, ruta, { t, payload, headers } = {}) =>
  app.inject({ method, url: `${PREFIJO}${ruta}`, payload, headers: { ...(t ? auth(t) : {}), ...headers } });

before(async () => {
  ({ app, pool, cerrar } = await preparar());
  [tAdmin, tHernando, tLuz] = await Promise.all([token(app, CORREOS.admin), token(app, CORREOS.hernando), token(app, CORREOS.luz)]);
});
after(async () => cerrar());

describe('Sistema y documentación', () => {
  test('GET /salud responde ok', async () => {
    const cuerpo = cumpleContrato('verificarSalud', await pedir('GET', '/salud'));
    assert.equal(cuerpo.base_datos, 'ok');
  });
  test('la documentación interactiva está publicada en /docs', async () => {
    const r = await app.inject({ method: 'GET', url: '/docs/json' });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().info.title, 'API del Simulador de Destinos Ganaderos desde Yopal');
  });
  test('una ruta inexistente responde 404 con el esquema de error', async () => {
    const r = await pedir('GET', '/no-existe');
    assert.equal(r.statusCode, 404);
    assert.equal(r.json().codigo, 'NO_ENCONTRADO');
  });
  test('JSON mal formado responde 400', async () => {
    const r = await pedir('POST', '/lotes', { t: tHernando, payload: '{"nombre": ', headers: { 'content-type': 'application/json' } });
    cumpleContrato('crearLote', r);
    assert.equal(r.statusCode, 400);
  });
  test('se envían cabeceras de seguridad', async () => {
    const r = await pedir('GET', '/salud');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.ok(r.headers['content-security-policy']);
  });
});

describe('Autenticación', () => {
  test('registro crea usuario y productor, y devuelve un token', async () => {
    const r = await pedir('POST', '/auth/registro', { payload: { ...CC('1118540321'), nombre_completo: 'Pedro Pablo Ojeda', correo: 'pedro.ojeda@correo.co', contrasena: 'pradera-maní-2026', municipio: 'Maní', acepta_tratamiento_datos: true } });
    const cuerpo = cumpleContrato('registrarUsuario', r);
    assert.equal(r.statusCode, 201);
    assert.equal(cuerpo.usuario.rol, 'productor');
    assert.ok(cuerpo.usuario.productor_id);
    assert.ok(!('contrasena_hash' in cuerpo.usuario));
  });
  test('la contraseña se guarda cifrada con bcrypt, nunca en texto plano', async () => {
    const { rows } = await pool.query('SELECT contrasena_hash FROM usuario WHERE correo = $1', ['pedro.ojeda@correo.co']);
    assert.match(rows[0].contrasena_hash, /^\$2[aby]\$/);
    assert.ok(!rows[0].contrasena_hash.includes('pradera'));
  });
  test('correo repetido responde 409', async () => {
    const r = await pedir('POST', '/auth/registro', { payload: { ...CC('1118540399'), nombre_completo: 'Otro', correo: 'HERNANDO.RINCON@correo.co', contrasena: 'una-clave-larga-1', municipio: 'Yopal', acepta_tratamiento_datos: true } });
    cumpleContrato('registrarUsuario', r);
    assert.equal(r.statusCode, 409);
  });
  test('contraseña corta y correo inválido responden 422 con un detalle por campo', async () => {
    const r = await pedir('POST', '/auth/registro', { payload: { ...CC('1118540388'), nombre_completo: 'Ana', correo: 'no-es-correo', contrasena: 'corta', municipio: 'Yopal', acepta_tratamiento_datos: true } });
    const cuerpo = cumpleContrato('registrarUsuario', r);
    assert.equal(r.statusCode, 422);
    const campos = cuerpo.detalles.map((d) => d.campo).sort();
    assert.deepEqual(campos, ['contrasena', 'correo']);
  });
  test('contraseña incorrecta responde 401 sin decir si el correo existe', async () => {
    const malo = await pedir('POST', '/auth/ingreso', { payload: { correo: CORREOS.hernando, contrasena: 'equivocada-123' } });
    const noExiste = await pedir('POST', '/auth/ingreso', { payload: { correo: 'nadie@correo.co', contrasena: 'equivocada-123' } });
    cumpleContrato('iniciarSesion', malo);
    assert.equal(malo.statusCode, 401);
    assert.equal(noExiste.statusCode, 401);
    assert.equal(malo.json().mensaje, noExiste.json().mensaje);
  });
  test('GET /auth/yo exige token válido', async () => {
    const sinToken = await pedir('GET', '/auth/yo');
    cumpleContrato('obtenerUsuarioActual', sinToken);
    assert.equal(sinToken.statusCode, 401);
    const falso = await pedir('GET', '/auth/yo', { t: 'abc.def.ghi' });
    assert.equal(falso.statusCode, 401);
    const bien = cumpleContrato('obtenerUsuarioActual', await pedir('GET', '/auth/yo', { t: tHernando }));
    assert.equal(bien.productor_id, IDS.hernando);
  });
  test('después de 3 intentos por minuto responde 429 (límite configurable)', async () => {
    const { crearPool } = await import('../src/bd.js');
    const pool = crearPool(config.baseDatosUrl);
    const otra = await construirApp({ config, pool, limiteIngreso: 3, registrar: false });
    const intento = () => otra.inject({ method: 'POST', url: `${PREFIJO}/auth/ingreso`, payload: { correo: 'x@correo.co', contrasena: 'y' } });
    for (let i = 0; i < 3; i++) assert.equal((await intento()).statusCode, 401);
    const bloqueado = await intento();
    cumpleContrato('iniciarSesion', bloqueado);
    assert.equal(bloqueado.statusCode, 429);
    await otra.close(); await pool.end();
  });
});

describe('Productores', () => {
  test('solo un administrador puede listar productores', async () => {
    const negado = await pedir('GET', '/productores', { t: tHernando });
    cumpleContrato('listarProductores', negado);
    assert.equal(negado.statusCode, 403);
    const r = await pedir('GET', '/productores?municipio=yopal', { t: tAdmin });
    const cuerpo = cumpleContrato('listarProductores', r);
    assert.ok(cuerpo.datos.every((p) => p.municipio === 'Yopal'));
  });
  test('un productor ve su ficha pero no la de otro', async () => {
    assert.equal(cumpleContrato('obtenerProductor', await pedir('GET', `/productores/${IDS.hernando}`, { t: tHernando })).id, IDS.hernando);
    const ajeno = await pedir('GET', `/productores/${IDS.luz}`, { t: tHernando });
    cumpleContrato('obtenerProductor', ajeno);
    assert.equal(ajeno.statusCode, 403);
  });
  test('un productor actualiza su teléfono', async () => {
    const r = await pedir('PATCH', `/productores/${IDS.hernando}`, { t: tHernando, payload: { telefono: '3124587799' } });
    assert.equal(cumpleContrato('actualizarProductor', r).telefono, '3124587799');
  });
  test('teléfono con formato inválido responde 422', async () => {
    const r = await pedir('PATCH', `/productores/${IDS.hernando}`, { t: tHernando, payload: { telefono: '12345' } });
    cumpleContrato('actualizarProductor', r);
    assert.equal(r.statusCode, 422);
  });
  test('el administrador crea y elimina un productor sin lotes; con lotes responde 409', async () => {
    const creado = cumpleContrato('crearProductor', await pedir('POST', '/productores', { t: tAdmin, payload: { ...CC('86045123'), nombre_completo: 'Wilson Pérez Daza', municipio: 'Trinidad' } }));
    const borrar = await pedir('DELETE', `/productores/${creado.id}`, { t: tAdmin });
    cumpleContrato('eliminarProductor', borrar);
    assert.equal(borrar.statusCode, 204);
    const conLotes = await pedir('DELETE', `/productores/${IDS.luz}`, { t: tAdmin });
    cumpleContrato('eliminarProductor', conLotes);
    assert.equal(conLotes.statusCode, 409);
  });
});

describe('Lotes', () => {
  let nuevo;
  test('un productor crea un lote a su nombre sin enviar productor_id', async () => {
    const r = await pedir('POST', '/lotes', { t: tHernando, payload: { nombre: 'Novillos de noviembre', cantidad_animales: 27, peso_promedio_kg: 448.5, categoria: 'novillo_gordo', municipio_origen: 'Yopal' } });
    nuevo = cumpleContrato('crearLote', r);
    assert.equal(r.statusCode, 201);
    assert.equal(nuevo.productor_id, IDS.hernando);
    assert.equal(nuevo.peso_total_kg, 12109.5);
    assert.equal(nuevo.estado, 'disponible');
    assert.equal(r.headers.location, `/api/v1/lotes/${nuevo.id}`);
  });
  test('cuerpo vacío responde 422 con todos los campos que faltan', async () => {
    const r = await pedir('POST', '/lotes', { t: tHernando, payload: {} });
    const cuerpo = cumpleContrato('crearLote', r);
    assert.equal(r.statusCode, 422);
    assert.deepEqual(cuerpo.detalles.map((d) => d.campo).sort(), ['cantidad_animales', 'categoria', 'nombre', 'peso_promedio_kg']);
  });
  test('valores fuera de rango responden 422 con el mensaje en español', async () => {
    const r = await pedir('POST', '/lotes', { t: tHernando, payload: { nombre: 'Lote', cantidad_animales: 300, peso_promedio_kg: 50, categoria: 'caballo', municipio_origen: 'Yopal' } });
    const cuerpo = cumpleContrato('crearLote', r);
    const por = Object.fromEntries(cuerpo.detalles.map((d) => [d.campo, d.problema]));
    assert.equal(por.cantidad_animales, 'Debe ser menor o igual a 200.');
    assert.equal(por.peso_promedio_kg, 'Debe ser mayor o igual a 80.');
    assert.match(por.categoria, /^Debe ser uno de:/);
  });
  test('un productor no puede crear lotes a nombre de otro', async () => {
    const r = await pedir('POST', '/lotes', { t: tHernando, payload: { productor_id: IDS.luz, nombre: 'Ajeno', cantidad_animales: 5, peso_promedio_kg: 400, categoria: 'vaca_gorda', municipio_origen: 'Aguazul' } });
    cumpleContrato('crearLote', r);
    assert.equal(r.statusCode, 403);
  });
  test('sin token responde 401', async () => {
    const r = await pedir('GET', '/lotes');
    cumpleContrato('listarLotes', r);
    assert.equal(r.statusCode, 401);
  });
  test('cada productor solo lista sus lotes, aunque pida los de otro', async () => {
    const r = cumpleContrato('listarLotes', await pedir('GET', `/lotes?productor_id=${IDS.luz}`, { t: tHernando }));
    assert.ok(r.total >= 1);
    assert.ok(r.datos.every((l) => l.productor_id === IDS.hernando));
    const admin = cumpleContrato('listarLotes', await pedir('GET', '/lotes?por_pagina=100', { t: tAdmin }));
    assert.ok(new Set(admin.datos.map((l) => l.productor_id)).size > 1);
  });
  test('paginación: por_pagina limita y total cuenta todo', async () => {
    const r = cumpleContrato('listarLotes', await pedir('GET', '/lotes?por_pagina=2&pagina=1', { t: tAdmin }));
    assert.equal(r.datos.length, 2);
    assert.ok(r.total > 2);
  });
  test('UUID mal escrito responde 400', async () => {
    const r = await pedir('GET', '/lotes/lote-1', { t: tHernando });
    const cuerpo = cumpleContrato('obtenerLote', r);
    assert.equal(r.statusCode, 400);
    assert.equal(cuerpo.detalles[0].problema, 'Debe ser un UUID válido.');
  });
  test('no se puede ver ni modificar el lote de otro productor', async () => {
    const ver = await pedir('GET', `/lotes/${IDS.loteLuz}`, { t: tHernando });
    cumpleContrato('obtenerLote', ver);
    assert.equal(ver.statusCode, 403);
    const cambiar = await pedir('PATCH', `/lotes/${IDS.loteLuz}`, { t: tHernando, payload: { nombre: 'Robado' } });
    assert.equal(cambiar.statusCode, 403);
  });
  test('PATCH recalcula el peso total', async () => {
    const r = await pedir('PATCH', `/lotes/${nuevo.id}`, { t: tHernando, payload: { cantidad_animales: 28 } });
    assert.equal(cumpleContrato('actualizarLote', r).peso_total_kg, 28 * 448.5);
  });
  test('PATCH vacío responde 422', async () => {
    const r = await pedir('PATCH', `/lotes/${nuevo.id}`, { t: tHernando, payload: {} });
    cumpleContrato('actualizarLote', r);
    assert.equal(r.statusCode, 422);
  });
  test('un lote con simulaciones no se elimina (409); uno sin simulaciones sí (204)', async () => {
    const usado = await pedir('DELETE', `/lotes/${IDS.loteHernando}`, { t: tHernando });
    cumpleContrato('eliminarLote', usado);
    assert.equal(usado.statusCode, 409);
    const libre = await pedir('DELETE', `/lotes/${nuevo.id}`, { t: tHernando });
    cumpleContrato('eliminarLote', libre);
    assert.equal(libre.statusCode, 204);
    assert.equal((await pedir('GET', `/lotes/${nuevo.id}`, { t: tHernando })).statusCode, 404);
  });
});

describe('Destinos, precios y rutas', () => {
  test('el catálogo de destinos es público y paginado', async () => {
    const r = cumpleContrato('listarDestinos', await pedir('GET', '/destinos?por_pagina=50'));
    assert.equal(r.total, 11);
  });
  test('filtro espacial PostGIS: destinos a menos de 150 km de Yopal', async () => {
    const r = cumpleContrato('listarDestinos', await pedir('GET', '/destinos?cerca_lat=5.3371&cerca_lon=-72.3959&radio_km=150'));
    assert.ok(r.datos.length >= 3);
    assert.ok(r.datos.every((d) => d.distancia_lineal_km <= 150));
    const distancias = r.datos.map((d) => d.distancia_lineal_km);
    assert.deepEqual(distancias, [...distancias].sort((a, b) => a - b));
    assert.ok(!r.datos.some((d) => d.id === IDS.medellin));
  });
  test('filtro espacial incompleto responde 422', async () => {
    const r = await pedir('GET', '/destinos?cerca_lat=5.3&cerca_lon=-72.3');
    cumpleContrato('listarDestinos', r);
    assert.equal(r.statusCode, 422);
    assert.equal(r.json().detalles[0].campo, 'radio_km');
  });
  test('un productor no puede crear destinos (403)', async () => {
    const r = await pedir('POST', '/destinos', { t: tHernando, payload: { nombre: 'X destino', tipo: 'feria', municipio: 'Yopal', departamento: 'Casanare', ubicacion: { type: 'Point', coordinates: [-72.4, 5.3] } } });
    cumpleContrato('crearDestino', r);
    assert.equal(r.statusCode, 403);
  });
  test('ciclo completo de un destino nuevo: crear, precio, ruta, corregir y eliminar', async () => {
    const d = cumpleContrato('crearDestino', await pedir('POST', '/destinos', { t: tAdmin, payload: { nombre: 'Subasta Ganadera de Aguazul', tipo: 'subasta', municipio: 'Aguazul', departamento: 'Casanare', ubicacion: { type: 'Point', coordinates: [-72.5471, 5.1731] }, comision_pct: 3 } }));
    assert.equal(d.comision_pct, 3);
    const repetido = await pedir('POST', '/destinos', { t: tAdmin, payload: { nombre: 'subasta ganadera de aguazul', tipo: 'subasta', municipio: 'Aguazul', departamento: 'Casanare', ubicacion: { type: 'Point', coordinates: [-72.5, 5.1] } } });
    cumpleContrato('crearDestino', repetido);
    assert.equal(repetido.statusCode, 409);

    const precio = cumpleContrato('registrarPrecio', await pedir('POST', `/destinos/${d.id}/precios`, { t: tAdmin, payload: { categoria: 'novillo_gordo', precio_kg_cop: 10380, fecha: '2026-10-09', fuente: 'Boletín de la subasta' } }));
    const doble = await pedir('POST', `/destinos/${d.id}/precios`, { t: tAdmin, payload: { categoria: 'novillo_gordo', precio_kg_cop: 10400, fecha: '2026-10-09', fuente: 'Otra' } });
    cumpleContrato('registrarPrecio', doble);
    assert.equal(doble.statusCode, 409);
    assert.equal(cumpleContrato('actualizarPrecio', await pedir('PATCH', `/precios/${precio.id}`, { t: tAdmin, payload: { precio_kg_cop: 10420 } })).precio_kg_cop, 10420);

    const ruta = cumpleContrato('crearRuta', await pedir('POST', '/rutas', { t: tAdmin, payload: { destino_id: d.id, distancia_km: 26, tiempo_horas: 0.6, peajes_cop: 0, merma_pct: 1, geometria: { type: 'LineString', coordinates: [[-72.3959, 5.3371], [-72.5471, 5.1731]] } } }));
    assert.deepEqual(ruta.origen.coordinates, [-72.3959, 5.3371]);
    assert.equal(cumpleContrato('actualizarRuta', await pedir('PATCH', `/rutas/${ruta.id}`, { t: tAdmin, payload: { merma_pct: 1.2 } })).merma_pct, 1.2);

    assert.equal(cumpleContrato('actualizarDestino', await pedir('PATCH', `/destinos/${d.id}`, { t: tAdmin, payload: { comision_pct: 2.5 } })).comision_pct, 2.5);
    const precios = cumpleContrato('listarPreciosDestino', await pedir('GET', `/destinos/${d.id}/precios`));
    assert.equal(precios.length, 1);

    assert.equal((await pedir('DELETE', `/precios/${precio.id}`, { t: tAdmin })).statusCode, 204);
    assert.equal((await pedir('DELETE', `/rutas/${ruta.id}`, { t: tAdmin })).statusCode, 204);
    const fin = await pedir('DELETE', `/destinos/${d.id}`, { t: tAdmin });
    cumpleContrato('eliminarDestino', fin);
    assert.equal(fin.statusCode, 204);
  });
  test('un destino usado en simulaciones no se elimina (409)', async () => {
    const r = await pedir('DELETE', `/destinos/${IDS.guadalupe}`, { t: tAdmin });
    cumpleContrato('eliminarDestino', r);
    assert.equal(r.statusCode, 409);
  });
  test('rutas públicas, ordenadas por distancia y con geometría GeoJSON', async () => {
    const r = cumpleContrato('listarRutas', await pedir('GET', '/rutas?max_distancia_km=300'));
    assert.ok(r.every((x) => x.distancia_km <= 300 && x.geometria.type === 'LineString'));
    const una = cumpleContrato('obtenerRuta', await pedir('GET', `/rutas/${IDS.rutaVillavicencio}`));
    assert.equal(una.merma_pct, 6.5);
  });
});

describe('Simulaciones', () => {
  let creada;
  test('calcula, ordena por utilidad y guarda la simulación', async () => {
    const r = await pedir('POST', '/simulaciones', { t: tHernando, payload: { lote_id: IDS.loteHernando, flete_km_cop: 7000, destino_ids: [IDS.finca, IDS.yopal, IDS.guadalupe] } });
    creada = cumpleContrato('crearSimulacion', r);
    assert.equal(r.statusCode, 201);
    assert.equal(creada.capacidad_camion, 25, 'usa el valor por defecto del contrato');
    const utilidades = creada.resultados.map((x) => x.utilidad_neta_cop);
    assert.deepEqual(utilidades, [...utilidades].sort((a, b) => b - a));
    assert.deepEqual(creada.resultados.map((x) => x.posicion), [1, 2, 3]);
    assert.equal(creada.mejor_destino_id, creada.resultados[0].destino_id);
    const g = creada.resultados.find((x) => x.destino_id === IDS.guadalupe);
    assert.equal(g.camiones, 2);
    assert.equal(g.utilidad_neta_cop, g.ingreso_bruto_cop - g.flete_cop - g.peajes_cop - g.comision_cop);
    const y = creada.resultados.find((x) => x.destino_id === IDS.yopal);
    assert.ok(y.comision_cop > 0, 'la subasta cobra comisión');
  });
  test('si el flete incluye peajes, los peajes quedan en cero', async () => {
    const r = cumpleContrato('crearSimulacion', await pedir('POST', '/simulaciones', { t: tHernando, payload: { lote_id: IDS.loteHernando, flete_km_cop: 7000, flete_incluye_peajes: true, destino_ids: [IDS.yopal, IDS.guadalupe] } }));
    assert.ok(r.resultados.every((x) => x.peajes_cop === 0));
  });
  test('un lote de levante no se puede comparar en un frigorífico (sin precio): 422 que dice cuál', async () => {
    const r = await pedir('POST', '/simulaciones', { t: tHernando, payload: { lote_id: IDS.loteLevanteHernando, flete_km_cop: 6500, destino_ids: [IDS.finca, IDS.guadalupe] } });
    const cuerpo = cumpleContrato('crearSimulacion', r);
    assert.equal(r.statusCode, 422);
    assert.equal(cuerpo.detalles[0].campo, 'destino_ids[1]');
    assert.match(cuerpo.detalles[0].problema, /novillo_levante/);
  });
  test('menos de dos destinos o destinos repetidos responden 422', async () => {
    const uno = await pedir('POST', '/simulaciones', { t: tHernando, payload: { lote_id: IDS.loteHernando, flete_km_cop: 7000, destino_ids: [IDS.yopal] } });
    cumpleContrato('crearSimulacion', uno);
    assert.equal(uno.statusCode, 422);
    const repetidos = await pedir('POST', '/simulaciones', { t: tHernando, payload: { lote_id: IDS.loteHernando, flete_km_cop: 7000, destino_ids: [IDS.yopal, IDS.yopal] } });
    assert.equal(repetidos.statusCode, 422);
  });
  test('lote inexistente responde 404; lote ajeno responde 403', async () => {
    const no = await pedir('POST', '/simulaciones', { t: tHernando, payload: { lote_id: '00000000-0000-4000-8000-000000000000', flete_km_cop: 7000, destino_ids: [IDS.yopal, IDS.finca] } });
    cumpleContrato('crearSimulacion', no);
    assert.equal(no.statusCode, 404);
    const ajeno = await pedir('POST', '/simulaciones', { t: tHernando, payload: { lote_id: IDS.loteLuz, flete_km_cop: 7000, destino_ids: [IDS.yopal, IDS.finca] } });
    cumpleContrato('crearSimulacion', ajeno);
    assert.equal(ajeno.statusCode, 403);
  });
  test('el historial de cada productor solo trae sus simulaciones, de la más reciente a la más antigua', async () => {
    const r = cumpleContrato('listarSimulaciones', await pedir('GET', '/simulaciones?por_pagina=100', { t: tHernando }));
    assert.equal(r.datos[0].id, r.datos.find((s) => s.creado_en >= creada.creado_en).id);
    const deLuz = cumpleContrato('listarSimulaciones', await pedir('GET', '/simulaciones?por_pagina=100', { t: tLuz }));
    assert.ok(!deLuz.datos.some((s) => s.id === creada.id));
  });
  test('una simulación guardada no cambia si después cambia el precio', async () => {
    const antes = creada.resultados.find((x) => x.destino_id === IDS.guadalupe).precio_kg_cop;
    await pedir('POST', `/destinos/${IDS.guadalupe}/precios`, { t: tAdmin, payload: { categoria: 'novillo_gordo', precio_kg_cop: 13000, fecha: HOY, fuente: 'Prueba' } });
    const despues = cumpleContrato('obtenerSimulacion', await pedir('GET', `/simulaciones/${creada.id}`, { t: tHernando }));
    assert.equal(despues.resultados.find((x) => x.destino_id === IDS.guadalupe).precio_kg_cop, antes);
  });
  test('otro productor no ve ni borra la simulación (403); el dueño la borra (204)', async () => {
    const ver = await pedir('GET', `/simulaciones/${creada.id}`, { t: tLuz });
    cumpleContrato('obtenerSimulacion', ver);
    assert.equal(ver.statusCode, 403);
    assert.equal((await pedir('DELETE', `/simulaciones/${creada.id}`, { t: tLuz })).statusCode, 403);
    const borrar = await pedir('DELETE', `/simulaciones/${creada.id}`, { t: tHernando });
    cumpleContrato('eliminarSimulacion', borrar);
    assert.equal(borrar.statusCode, 204);
  });
});
