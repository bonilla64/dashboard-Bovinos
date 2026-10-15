// Sincroniza los precios desde la hoja de Fedegán publicada como CSV.
// Uso:
//   npm run precios:sincronizar            descarga PRECIOS_CSV_URL e importa
//   npm run precios:sincronizar -- --revisar  además falla si algún precio tiene más de PRECIO_DIAS_ADVERTENCIA días
// La tarea programada .github/workflows/precios.yml lo corre cada 3 días.
import { fileURLToPath } from 'node:url';
import { crearPool } from '../src/bd.js';
import { importarPrecios, leerCsv, preciosVencidos } from '../src/precios/importar.js';

export async function sincronizar({ url, baseDatosUrl, revisar = false, diasAdvertencia = 7, log = console.log }) {
  const respuesta = await fetch(url, { redirect: 'follow' });
  if (!respuesta.ok) throw new Error(`No se pudo descargar la hoja de precios (HTTP ${respuesta.status}).`);
  const filas = leerCsv(await respuesta.text());
  const pool = crearPool(baseDatosUrl);
  try {
    const r = await importarPrecios(pool, filas, { origen: 'programada' });
    log(`✔ Precios sincronizados: ${r.filas} filas, ${r.insertados} nuevos, ${r.actualizados} actualizados, ${r.sin_cambios} sin cambios.`);
    const vencidos = await preciosVencidos(pool, diasAdvertencia);
    if (vencidos.length) {
      log(`⚠ ${vencidos.length} precio(s) con más de ${diasAdvertencia} días:`);
      vencidos.forEach((v) => log(`  - ${v.nombre} · ${v.categoria}: ${v.ultima_fecha} (${v.dias} días)`));
    }
    return { importacion: r, vencidos, ok: !(revisar && vencidos.length) };
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.PRECIOS_CSV_URL;
  if (!url || !process.env.DATABASE_URL) {
    console.log('PRECIOS_CSV_URL o DATABASE_URL no están definidas: no se sincroniza nada.');
    process.exit(0);
  }
  sincronizar({
    url, baseDatosUrl: process.env.DATABASE_URL, revisar: process.argv.includes('--revisar'),
    diasAdvertencia: Number(process.env.PRECIO_DIAS_ADVERTENCIA || 7),
  })
    .then(({ ok }) => process.exit(ok ? 0 : 2))
    .catch((e) => {
      console.error(`✖ ${e.message}`);
      (e.detalles || []).forEach((d) => console.error(`  - ${d.campo}: ${d.problema}`));
      process.exit(1);
    });
}
