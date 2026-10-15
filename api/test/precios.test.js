// Vigencia de precios, importación por lotes (CSV de Fedegán) y sincronización programada.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { preparar, token, cumpleContrato, PREFIJO, CORREOS, IDS, URL_PRUEBAS } from './ayuda.js';
import { sincronizar } from '../scripts/sincronizar-precios.js';

let app; let pool; let cerrar; let tAdmin; let tHernando;
const dia = (n) => new Date(Date.now() - 5 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
const HOY = dia(0);
const csv = (texto, t = tAdmin) => app.inject({
  method: 'POST', url: `${PREFIJO}/precios/importacion`, payload: texto,
  headers: { 'content-type': 'text/csv', ...(t ? { authorization: `Bearer ${t}` } : {}) },
});
const contarPrecios = async () => Number((await pool.query('SELECT count(*) FROM precio_mercado')).rows[0].count);

before(async () => {
  ({ app, pool, cerrar } = await preparar());
  [tAdmin, tHernando] = await Promise.all([token(app, CORREOS.admin), token(app, CORREOS.hernando)]);
});
after(async () => cerrar());

describe('Datos de demostración', () => {
  test('el precio más reciente es de hace 2 días, aunque la demo se cargue otro día', async () => {
    const { rows } = await pool.query("SELECT to_char(max(fecha), 'YYYY-MM-DD') AS f FROM precio_mercado");
    assert.equal(rows[0].f, dia(2));
  });
  test('cada precio informa su antigüedad', async () => {
    const r = cumpleContrato('listarPreciosDestino', await app.inject({ method: 'GET', url: `${PREFIJO}/destinos/${IDS.guadalupe}/precios` }));
    assert.equal(r[0].antiguedad_dias, 2);
  });
});

describe('Importación de precios (CSV)', () => {
  const ENCABEZADO = 'destino,categoria,precio_kg_cop,fecha,fuente,referencia';

  test('importa precios por nombre de destino y cuenta lo que hizo', async () => {
    const r = await csv([
      ENCABEZADO,
      `Frigorífico Guadalupe,novillo_gordo,11450,${HOY},Fedegán – precios semanales de ganado gordo,Planta Guadalupe (Bogotá)`,
      `subasta ganadera de yopal,Novillo gordo,"$10.520",${HOY},Fedegán – precios en subastas,Subastas Llanos Orientales`,
      ',,,,,Las filas sin destino son comentarios y se ignoran',
    ].join('\n'));
    const cuerpo = cumpleContrato('importarPrecios', r);
    assert.equal(r.statusCode, 201);
    assert.deepEqual([cuerpo.filas, cuerpo.insertados, cuerpo.actualizados, cuerpo.sin_cambios], [2, 2, 0, 0]);
    assert.equal(cuerpo.origen, 'manual');
    const { rows } = await pool.query('SELECT precio_kg_cop, referencia, importacion_id FROM precio_mercado WHERE destino_id = $1 AND fecha = $2 AND categoria = $3', [IDS.yopal, HOY, 'novillo_gordo']);
    assert.equal(rows[0].precio_kg_cop, 10520);
    assert.equal(rows[0].importacion_id, cuerpo.id);
  });

  test('acepta el CSV de Excel en español (punto y coma y fecha DD/MM/AAAA)', async () => {
    const [a, m, d] = HOY.split('-');
    const r = await csv(`destino;categoria;precio_kg_cop;fecha;fuente\nFrigorífico Guadalupe;novillo_gordo;11.480;${d}/${m}/${a};Fedegán`);
    const cuerpo = cumpleContrato('importarPrecios', r);
    assert.equal(cuerpo.actualizados, 1, 'mismo destino, categoría y fecha: se actualiza');
  });

  test('volver a cargar el mismo archivo no cambia nada', async () => {
    const texto = `${ENCABEZADO}\nFrigorífico Guadalupe,novillo_gordo,11480,${HOY},Fedegán,`;
    const r = cumpleContrato('importarPrecios', await csv(texto));
    assert.equal(r.sin_cambios, 1);
  });

  test('si una fila falla no se guarda ninguna, y el error dice fila y campo', async () => {
    const antes = await contarPrecios();
    const r = await csv([
      ENCABEZADO,
      `Frigorífico Guadalupe,vaca_gorda,9800,${dia(1)},Fedegán,`,
      `Frigorifico Guadalupe,novillo_gordo,11500,${HOY},Fedegán,`,
      `Subasta Ganadera de Yopal,caballo,100,mañana,,`,
      `Frigorífico Vijagual,novillo_gordo,11200,${dia(-3)},Fedegán,`,
    ].join('\n'));
    const cuerpo = cumpleContrato('importarPrecios', r);
    assert.equal(r.statusCode, 422);
    const campos = cuerpo.detalles.map((d) => d.campo);
    assert.ok(campos.includes('fila 3.destino'), 'sin tilde no es el mismo nombre');
    assert.ok(['fila 4.categoria', 'fila 4.precio_kg_cop', 'fila 4.fecha', 'fila 4.fuente'].every((c) => campos.includes(c)));
    assert.ok(campos.includes('fila 5.fecha'), 'fecha futura');
    assert.equal(await contarPrecios(), antes);
  });

  test('faltan columnas obligatorias: 422', async () => {
    const r = await csv('destino,precio\nFrigorífico Guadalupe,11000');
    const cuerpo = cumpleContrato('importarPrecios', r);
    assert.equal(r.statusCode, 422);
    assert.deepEqual(cuerpo.detalles.map((d) => d.campo).sort(), ['categoria', 'fecha', 'fuente', 'precio_kg_cop']);
  });

  test('solo el administrador importa (403) y hace falta sesión (401)', async () => {
    const texto = `${ENCABEZADO}\nFrigorífico Guadalupe,novillo_gordo,11000,${HOY},X,`;
    const negado = await csv(texto, tHernando);
    cumpleContrato('importarPrecios', negado);
    assert.equal(negado.statusCode, 403);
    assert.equal((await csv(texto, null)).statusCode, 401);
  });

  test('el historial de cargas lista la más reciente primero', async () => {
    const r = cumpleContrato('listarImportacionesPrecios', await app.inject({ method: 'GET', url: `${PREFIJO}/precios/importaciones`, headers: { authorization: `Bearer ${tAdmin}` } }));
    assert.ok(r.length >= 3);
    assert.ok(r[0].creado_en >= r[1].creado_en);
  });
});

describe('Vigencia en las simulaciones', () => {
  async function destinoConPrecio(nombre, diasAtras) {
    const auth = { authorization: `Bearer ${tAdmin}` };
    const d = (await app.inject({ method: 'POST', url: `${PREFIJO}/destinos`, headers: auth, payload: { nombre, tipo: 'feria', municipio: 'Tauramena', departamento: 'Casanare', ubicacion: { type: 'Point', coordinates: [-72.17, 5.02] } } })).json();
    await app.inject({ method: 'POST', url: `${PREFIJO}/rutas`, headers: auth, payload: { destino_id: d.id, distancia_km: 80, tiempo_horas: 1.6, merma_pct: 1.5, geometria: { type: 'LineString', coordinates: [[-72.3959, 5.3371], [-72.17, 5.02]] } } });
    await app.inject({ method: 'POST', url: `${PREFIJO}/destinos/${d.id}/precios`, headers: auth, payload: { categoria: 'novillo_gordo', precio_kg_cop: 10300, fecha: dia(diasAtras), fuente: 'Fedegán' } });
    return d.id;
  }

  test('un precio de 10 días se usa, pero con advertencia', async () => {
    const id = await destinoConPrecio('Feria de prueba con precio de 10 días', 10);
    const r = await app.inject({ method: 'POST', url: `${PREFIJO}/simulaciones`, headers: { authorization: `Bearer ${tHernando}` }, payload: { lote_id: IDS.loteHernando, flete_km_cop: 6500, destino_ids: [IDS.finca, id] } });
    const s = cumpleContrato('crearSimulacion', r);
    const res = s.resultados.find((x) => x.destino_id === id);
    assert.equal(res.precio_antiguedad_dias, 10);
    assert.match(res.advertencia, /hace 10 días/);
    assert.equal(s.resultados.find((x) => x.destino_id === IDS.finca).advertencia, null);
  });

  test('un precio de más de 30 días no se usa: 422 que pide actualizar', async () => {
    const id = await destinoConPrecio('Feria de prueba con precio de 40 días', 40);
    const r = await app.inject({ method: 'POST', url: `${PREFIJO}/simulaciones`, headers: { authorization: `Bearer ${tHernando}` }, payload: { lote_id: IDS.loteHernando, flete_km_cop: 6500, destino_ids: [IDS.finca, id] } });
    const cuerpo = cumpleContrato('crearSimulacion', r);
    assert.equal(r.statusCode, 422);
    assert.match(cuerpo.detalles[0].problema, /hace 40 días.*Actualice los precios/);
  });
});

describe('Sincronización programada desde la hoja publicada', () => {
  test('descarga el CSV, lo importa como «programada» y avisa de precios viejos', async () => {
    const servidor = http.createServer((_, res) => {
      res.setHeader('content-type', 'text/csv');
      res.end(`destino,categoria,precio_kg_cop,fecha,fuente\nPlaza de ferias de Tunja,novillo_gordo,11050,${HOY},Fedegán – hoja del equipo\n`);
    });
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    const mensajes = [];
    try {
      const r = await sincronizar({ url: `http://127.0.0.1:${servidor.address().port}/precios.csv`, baseDatosUrl: URL_PRUEBAS, revisar: true, diasAdvertencia: 7, log: (m) => mensajes.push(m) });
      assert.equal(r.importacion.origen, 'programada');
      assert.equal(r.importacion.insertados, 1);
      assert.ok(r.vencidos.some((v) => v.nombre === 'Feria de prueba con precio de 40 días'));
      assert.equal(r.ok, false, 'con --revisar falla si hay precios viejos, para que GitHub avise');
      assert.ok(mensajes.some((m) => m.startsWith('⚠')));
    } finally {
      servidor.close();
    }
  });
});
