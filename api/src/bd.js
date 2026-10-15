// Acceso a PostgreSQL con node-postgres. Todas las consultas usan parámetros ($1, $2…),
// nunca concatenación de texto, para evitar inyección SQL.
import pg from 'pg';

// numeric y bigint llegan como texto por defecto; aquí se convierten a número.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // bigint (count)

export function crearPool(url) {
  return new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30000 });
}

// Ejecuta fn dentro de una transacción: si algo falla, no queda nada a medio guardar.
export async function enTransaccion(pool, fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  } finally {
    cliente.release();
  }
}
