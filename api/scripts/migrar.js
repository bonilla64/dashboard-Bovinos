// Aplica en orden los archivos de db/migraciones que aún no se han aplicado.
// Uso: npm run migrar   (necesita DATABASE_URL)
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearPool, enTransaccion } from '../src/bd.js';

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migraciones');

export async function migrar(url, { silencioso = false } = {}) {
  const pool = crearPool(url);
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS migracion_aplicada (
      nombre varchar(200) PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await pool.query('SELECT nombre FROM migracion_aplicada');
    const hechas = new Set(rows.map((r) => r.nombre));
    const pendientes = readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort().filter((f) => !hechas.has(f));
    for (const archivo of pendientes) {
      await enTransaccion(pool, async (bd) => {
        await bd.query(readFileSync(path.join(carpeta, archivo), 'utf8'));
        await bd.query('INSERT INTO migracion_aplicada (nombre) VALUES ($1)', [archivo]);
      });
      if (!silencioso) console.log(`✔ Migración aplicada: ${archivo}`);
    }
    if (!pendientes.length && !silencioso) console.log('La base de datos ya está al día.');
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL. Copie .env.example como .env o defina la variable.');
    process.exit(1);
  }
  migrar(process.env.DATABASE_URL).catch((e) => { console.error(e.message); process.exit(1); });
}
