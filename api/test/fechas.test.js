// «Hoy» es el día de Colombia aunque el servidor de base de datos trabaje en UTC (GitHub, Render, Neon).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearPool, HOY_COLOMBIA } from '../src/bd.js';
import { URL_PRUEBAS } from './ayuda.js';

const pool = crearPool(URL_PRUEBAS);
after(() => pool.end());

test('la fecha de hoy se toma en hora de Colombia, no en UTC', async () => {
  const cliente = await pool.connect();
  try {
    await cliente.query("SET TIME ZONE 'UTC'");
    const { rows: [r] } = await cliente.query(`SELECT to_char(${HOY_COLOMBIA}, 'YYYY-MM-DD') AS hoy`);
    const esperado = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
    assert.equal(r.hoy, esperado);
  } finally {
    cliente.release();
  }
});
