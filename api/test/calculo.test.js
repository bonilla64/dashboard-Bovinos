import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularResultado, ordenarResultados } from '../src/calculo.js';

const lote = { cantidad_animales: 30, peso_total_kg: 13560 };
const param = { flete_km_cop: 7000, capacidad_camion: 25, flete_incluye_peajes: false };
const guadalupe = { distancia_km: 382, tiempo_horas: 8.4, peajes_cop: 110000, factor_dificultad: 1.25, merma_pct: 7.7 };

test('reproduce el ejemplo del contrato para Frigorífico Guadalupe', () => {
  const r = calcularResultado(lote, param, { comision_pct: 0 }, guadalupe, 11300);
  assert.equal(r.camiones, 2);
  assert.equal(r.peso_vendido_kg, 12515.9);
  assert.equal(r.ingreso_bruto_cop, 141429670);
  assert.equal(r.flete_cop, 6685000);
  assert.equal(r.peajes_cop, 220000);
  assert.equal(r.utilidad_neta_cop, 134524670);
});

test('la comisión de subasta se descuenta del ingreso', () => {
  const yopal = { distancia_km: 9.5, tiempo_horas: 0.3, peajes_cop: 0, factor_dificultad: 1, merma_pct: 0.5 };
  const r = calcularResultado(lote, param, { comision_pct: 3 }, yopal, 10400);
  assert.equal(r.comision_cop, Math.round(140318880 * 0.03));
  assert.equal(r.costo_logistico_cop, r.flete_cop + r.comision_cop);
});

test('el número de camiones redondea hacia arriba', () => {
  const ruta = { ...guadalupe, merma_pct: 0 };
  assert.equal(calcularResultado({ ...lote, cantidad_animales: 25 }, param, { comision_pct: 0 }, ruta, 1).camiones, 1);
  assert.equal(calcularResultado({ ...lote, cantidad_animales: 26 }, param, { comision_pct: 0 }, ruta, 1).camiones, 2);
});

test('si el flete incluye peajes, no se cobran dos veces', () => {
  const r = calcularResultado(lote, { ...param, flete_incluye_peajes: true }, { comision_pct: 0 }, guadalupe, 11300);
  assert.equal(r.peajes_cop, 0);
});

test('ordena de mayor a menor utilidad y asigna posiciones', () => {
  const lista = ordenarResultados([{ utilidad_neta_cop: 5, distancia_km: 1 }, { utilidad_neta_cop: 9, distancia_km: 1 }]);
  assert.deepEqual(lista.map((r) => [r.utilidad_neta_cop, r.posicion]), [[9, 1], [5, 2]]);
});
