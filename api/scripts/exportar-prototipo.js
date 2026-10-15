// Copia los datos de la base a web/datos/ejemplo.json, para que el prototipo muestre lo mismo que la API.
// Uso (con la base ya sembrada): npm run exportar:prototipo
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearPool } from '../src/bd.js';
import { COL_DESTINO, COL_LOTE, COL_PRECIO, COL_PRODUCTOR, COL_RESULTADO, COL_RUTA, COL_SIMULACION } from '../src/consultas.js';

const destino = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'datos', 'ejemplo.json');
const pool = crearPool(process.env.DATABASE_URL);
const q = async (sql) => (await pool.query(sql)).rows;
try {
  const simulaciones = await q(`SELECT ${COL_SIMULACION} FROM simulacion ORDER BY creado_en DESC`);
  const resultados = await q(`SELECT ${COL_RESULTADO} FROM resultado_simulacion ORDER BY posicion`);
  for (const s of simulaciones) s.resultados = resultados.filter((r) => r.simulacion_id === s.id);
  const rutas = await q(`SELECT ${COL_RUTA} FROM ruta ORDER BY distancia_km`);
  // Solo el precio vigente (el más reciente) de cada destino y categoría.
  const precios = await q(`SELECT DISTINCT ON (destino_id, categoria) ${COL_PRECIO} FROM precio_mercado ORDER BY destino_id, categoria, fecha DESC`);
  const datos = {
    descripcion: 'Exportado desde la base de datos de la API (npm run exportar:prototipo). Precios estimados; ver docs/decisiones.md.',
    actualizado_en: new Date().toISOString(),
    origen: { nombre: rutas[0].origen_nombre, ubicacion: rutas[0].origen },
    flete_km_cop_por_defecto: 6500,
    capacidad_camion_por_defecto: 25,
    productores: await q(`SELECT ${COL_PRODUCTOR} FROM productor ORDER BY nombre_completo`),
    lotes: await q(`SELECT ${COL_LOTE} FROM lote ORDER BY creado_en`),
    destinos: await q(`SELECT ${COL_DESTINO} FROM destino WHERE activo ORDER BY nombre`),
    rutas,
    precios,
    simulaciones,
  };
  writeFileSync(destino, `${JSON.stringify(datos, null, 2)}\n`);
  console.log(`✔ ${path.relative(process.cwd(), destino)}: ${datos.destinos.length} destinos, ${datos.lotes.length} lotes, ${simulaciones.length} simulaciones.`);
} finally {
  await pool.end();
}
