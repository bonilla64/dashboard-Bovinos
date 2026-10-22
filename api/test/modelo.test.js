// Coherencia contrato ↔ base de datos: cada campo que devuelve la API existe como columna, con el mismo nombre.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { preparar, contrato } from './ayuda.js';

let ctx;
before(async () => { ctx = await preparar(); });
after(async () => ctx.cerrar());

const propiedades = (nombre) => {
  const salida = new Set();
  const recorrer = (e) => {
    if (e.$ref) return recorrer(contrato.components.schemas[e.$ref.split('/').pop()]);
    (e.allOf || []).forEach(recorrer);
    Object.keys(e.properties || {}).forEach((k) => salida.add(k));
  };
  recorrer(contrato.components.schemas[nombre]);
  return salida;
};

const CORRESPONDENCIA = {
  Productor: ['productor', []],
  Usuario: ['usuario', []],
  Lote: ['lote', ['simulaciones']],
  Finca: ['finca', ['lotes']],
  EntradaBitacora: ['bitacora', []],
  Destino: ['destino', ['distancia_lineal_km']],
  PrecioMercado: ['precio_mercado', ['antiguedad_dias']],
  ImportacionPrecios: ['importacion_precio', []],
  Ruta: ['ruta', []],
  Simulacion: ['simulacion', ['resultados']],
  ResultadoSimulacion: ['resultado_simulacion', []],
};

for (const [esquema, [tabla, calculados]] of Object.entries(CORRESPONDENCIA)) {
  test(`${esquema} ↔ tabla ${tabla}`, async () => {
    const { rows } = await ctx.pool.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2', ['public', tabla]);
    const columnas = new Set(rows.map((r) => r.column_name));
    const faltan = [...propiedades(esquema)].filter((c) => !calculados.includes(c) && !columnas.has(c));
    assert.deepEqual(faltan, [], `Campos del contrato sin columna en ${tabla}`);
  });
}
