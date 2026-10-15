// Rutas desde el municipio del lote (src/geo/origenes.js).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { preparar, token, cumpleContrato, PREFIJO, CORREOS, IDS } from './ayuda.js';
import { estimarRuta, interpolar, municipioCasanare, MUNICIPIOS, distanciaLinealKm, ORIGEN_YOPAL } from '../src/geo/origenes.js';

const SUBASTA_PAZ = '5a11df78-6998-5089-a775-55e35b205cfe';

describe('Estimación de rutas (función pura)', () => {
  const rutasYopal = [
    { destino_id: 'a', distancia_km: 100, tiempo_horas: 2, merma_pct: 3, peajes_cop: 20000, factor_dificultad: 1.05 },
    { destino_id: 'b', distancia_km: 400, tiempo_horas: 8, merma_pct: 8, peajes_cop: 100000, factor_dificultad: 1.25 },
  ];
  test('interpola entre puntos y no se sale de los extremos', () => {
    assert.equal(interpolar([[0, 0], [100, 3], [400, 8]], 250), 5.5);
    assert.equal(interpolar([[0, 0], [100, 3]], 900), 3);
  });
  test('reconoce municipios de Casanare con o sin tilde', () => {
    assert.equal(municipioCasanare('mani'), 'Maní');
    assert.equal(municipioCasanare('  PAZ DE ARIPORO '), 'Paz de Ariporo');
    assert.equal(municipioCasanare('Bogotá'), null);
  });
  test('la venta en finca no tiene viaje desde ningún origen', () => {
    const r = estimarRuta(MUNICIPIOS.Pore, { tipo: 'finca', ubicacion: { coordinates: MUNICIPIOS.Yopal } }, null, rutasYopal);
    assert.equal(r.distancia_km, 0);
    assert.equal(r.merma_pct, 0);
  });
  test('sin OSRM estima con línea recta × sinuosidad y conserva el recargo de la vía', () => {
    const destino = { tipo: 'feria', ubicacion: { coordinates: [-73.63, 4.15] } };
    const rutaYopal = { distancia_km: 266, factor_dificultad: 1.1 };
    const r = estimarRuta(MUNICIPIOS.Villanueva, destino, rutaYopal, rutasYopal);
    const linea = distanciaLinealKm(MUNICIPIOS.Villanueva, destino.ubicacion.coordinates);
    assert.equal(r.fuente, 'respaldo_linea_recta');
    assert.ok(r.distancia_km >= linea * 1.15 && r.distancia_km <= linea * 1.6);
    assert.equal(r.factor_dificultad, 1.1);
    assert.ok(r.merma_pct > 0 && r.merma_pct <= 15);
  });
  test('con OSRM usa su distancia y su trazado', () => {
    const osrm = { distancia_km: 210.4, tiempo_horas: 4.2, geometria: { type: 'LineString', coordinates: [[-72.9, 4.6], [-73.2, 4.4], [-73.6, 4.15]] } };
    const r = estimarRuta(MUNICIPIOS.Villanueva, { tipo: 'feria', ubicacion: { coordinates: [-73.6, 4.15] } }, null, rutasYopal, osrm);
    assert.equal(r.fuente, 'osrm');
    assert.equal(r.distancia_km, 210.4);
    assert.equal(r.geometria.coordinates.length, 3);
  });
});

describe('Simulación desde otro municipio', () => {
  let app; let pool; let cerrar; let t;
  const pedir = (method, ruta, payload) => app.inject({ method, url: `${PREFIJO}${ruta}`, payload, headers: { authorization: `Bearer ${t}` } });
  before(async () => {
    ({ app, pool, cerrar } = await preparar());
    t = await token(app, CORREOS.hernando);
  });
  after(async () => cerrar());

  test('un lote de Paz de Ariporo usa rutas desde Paz de Ariporo y las guarda una sola vez', async () => {
    const lote = cumpleContrato('crearLote', await pedir('POST', '/lotes', { nombre: 'Novillos de Paz de Ariporo', cantidad_animales: 25, peso_promedio_kg: 450, categoria: 'novillo_gordo', municipio_origen: 'Paz de Ariporo' }));
    const entrada = { lote_id: lote.id, flete_km_cop: 7000, destino_ids: [IDS.finca, IDS.yopal, SUBASTA_PAZ] };
    const sim = cumpleContrato('crearSimulacion', await pedir('POST', '/simulaciones', entrada));
    const de = (id) => sim.resultados.find((r) => r.destino_id === id);
    assert.equal(de(IDS.finca).distancia_km, 0);
    assert.ok(de(SUBASTA_PAZ).distancia_km < 20, 'la subasta de su municipio queda cerca');
    assert.ok(de(IDS.yopal).distancia_km > 80, 'Yopal queda lejos desde Paz de Ariporo');

    const rutas = cumpleContrato('listarRutas', await pedir('GET', `/rutas?origen=${encodeURIComponent('Paz de Ariporo')}`));
    for (const id of entrada.destino_ids) assert.ok(rutas.some((r) => r.destino_id === id), 'quedó guardada la ruta a cada destino');
    assert.ok(rutas.every((r) => r.origen_nombre === 'Paz de Ariporo'));
    assert.ok(rutas.filter((r) => r.distancia_km > 0).every((r) => r.fuente === 'respaldo_linea_recta'));

    const otra = cumpleContrato('crearSimulacion', await pedir('POST', '/simulaciones', entrada));
    assert.deepEqual(otra.resultados.map((r) => r.ruta_id).sort(), sim.resultados.map((r) => r.ruta_id).sort(), 'reutiliza las rutas guardadas');
  });

  test('un municipio fuera de Casanare usa las rutas medidas desde Yopal', async () => {
    const lote = cumpleContrato('crearLote', await pedir('POST', '/lotes', { nombre: 'Lote de Boyacá', cantidad_animales: 10, peso_promedio_kg: 430, categoria: 'novillo_gordo', municipio_origen: 'Sogamoso' }));
    const sim = cumpleContrato('crearSimulacion', await pedir('POST', '/simulaciones', { lote_id: lote.id, flete_km_cop: 7000, destino_ids: [IDS.yopal, IDS.guadalupe] }));
    const { rows } = await pool.query('SELECT DISTINCT origen_nombre FROM ruta WHERE id = ANY($1)', [sim.resultados.map((r) => r.ruta_id)]);
    assert.deepEqual(rows.map((r) => r.origen_nombre), [ORIGEN_YOPAL]);
  });
});
