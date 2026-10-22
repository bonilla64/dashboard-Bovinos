// Carga los datos de demostración del caso regional (db/semilla/datos.json).
// Uso: npm run sembrar             (no hace nada si ya hay datos)
//      npm run sembrar -- --forzar (borra todo y vuelve a cargar)
// Necesita DATABASE_URL y CONTRASENA_DEMO (contraseña de las cuentas de demostración, mínimo 10 caracteres).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearPool, enTransaccion } from '../src/bd.js';
import { cifrarContrasena } from '../src/auth.js';
import { calcularYGuardar } from '../src/rutas/simulaciones.js';
import { COL_LOTE } from '../src/consultas.js';

const RUTA_DATOS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'semilla', 'datos.json');
export const CORREO_ADMIN_DEMO = 'admin@simulador-ganadero.co';

const DIA = 24 * 3600 * 1000;

/**
 * Corre todas las fechas de la demostración para que el precio más reciente sea de hace 2 días.
 * Así la demo nunca queda con precios vencidos, aunque se cargue en diciembre.
 */
function actualizarFechas(datos, hoy = new Date()) {
  const ultima = datos.precios.map((p) => p.fecha).sort().pop();
  const objetivo = new Date(hoy.getTime() - 5 * 3600 * 1000 - 2 * DIA).toISOString().slice(0, 10);
  const dias = Math.round((Date.parse(objetivo) - Date.parse(ultima)) / DIA);
  const mover = (texto) => new Date(Date.parse(texto) + dias * DIA).toISOString();
  datos.precios.forEach((p) => { p.fecha = mover(`${p.fecha}T12:00:00Z`).slice(0, 10); });
  datos.lotes.forEach((l) => { l.creado_en = mover(l.creado_en); });
  datos.simulaciones.forEach((s) => { s.creado_en = mover(s.creado_en); });
  return dias;
}

export async function sembrar(url, contrasena, { forzar = false, costoBcrypt = 12, silencioso = false } = {}) {
  if (!contrasena || contrasena.length < 10) throw new Error('CONTRASENA_DEMO debe tener al menos 10 caracteres.');
  const datos = JSON.parse(readFileSync(RUTA_DATOS, 'utf8'));
  actualizarFechas(datos);
  const pool = crearPool(url);
  const log = (m) => { if (!silencioso) console.log(m); };
  try {
    const { rows } = await pool.query('SELECT count(*) AS n FROM destino');
    if (rows[0].n > 0 && !forzar) {
      log('Ya hay datos cargados. Use --forzar para borrarlos y cargar de nuevo.');
      return;
    }
    const hash = await cifrarContrasena(contrasena, costoBcrypt);
    await enTransaccion(pool, async (bd) => {
      await bd.query('TRUNCATE solicitud_contrasena, bitacora, resultado_simulacion, simulacion, lote, finca, importacion_precio, usuario, productor, precio_mercado, ruta, destino RESTART IDENTITY CASCADE');

      await bd.query(
        `INSERT INTO usuario (nombre_completo, correo, contrasena_hash, rol) VALUES ('Administración del simulador', $1, $2, 'administrador')`,
        [CORREO_ADMIN_DEMO, hash]);
      for (const p of datos.productores) {
        await bd.query(
          `INSERT INTO productor (id, nombre_completo, municipio, telefono, correo, tipo_persona, tipo_documento, numero_documento,
             representante_legal, departamento, vereda, documento_verificado, acepta_datos_en)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())`,
          [p.id, p.nombre_completo, p.municipio, p.telefono, p.correo, p.tipo_persona, p.tipo_documento, p.numero_documento,
            p.representante_legal, p.departamento, p.vereda, p.documento_verificado]);
        await bd.query(`INSERT INTO usuario (nombre_completo, correo, contrasena_hash, rol, productor_id) VALUES ($1,$2,$3,'productor',$4)`,
          [p.nombre_completo, p.correo, hash, p.id]);
      }
      for (const d of datos.destinos) {
        await bd.query(
          `INSERT INTO destino (id, nombre, tipo, municipio, departamento, ubicacion, comision_pct)
           VALUES ($1,$2,$3,$4,$5, ST_SetSRID(ST_GeomFromGeoJSON($6),4326), $7)`,
          [d.id, d.nombre, d.tipo, d.municipio, d.departamento, JSON.stringify(d.ubicacion), d.comision_pct]);
      }
      const origen = JSON.stringify(datos.origen.ubicacion);
      for (const r of datos.rutas) {
        await bd.query(
          `INSERT INTO ruta (id, destino_id, origen_nombre, origen, distancia_km, tiempo_horas, peajes_cop, factor_dificultad, merma_pct, geometria, fuente)
           VALUES ($1,$2,$3, ST_SetSRID(ST_GeomFromGeoJSON($4),4326), $5,$6,$7,$8,$9, ST_SetSRID(ST_GeomFromGeoJSON($10),4326), $11)`,
          [r.id, r.destino_id, datos.origen.nombre, origen, r.distancia_km, r.tiempo_horas, r.peajes_cop, r.factor_dificultad,
            r.merma_pct, JSON.stringify(r.geometria), r.fuente]);
      }
      for (const p of datos.precios) {
        await bd.query('INSERT INTO precio_mercado (destino_id, categoria, precio_kg_cop, fecha, fuente, referencia) VALUES ($1,$2,$3,$4,$5,$6)',
          [p.destino_id, p.categoria, p.precio_kg_cop, p.fecha, p.fuente, p.referencia ?? null]);
      }
      for (const f of datos.fincas) {
        await bd.query(
          `INSERT INTO finca (id, productor_id, nombre, departamento, municipio, vereda, ubicacion, area_ha)
           VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_GeomFromGeoJSON($7),4326), $8)`,
          [f.id, f.productor_id, f.nombre, f.departamento, f.municipio, f.vereda, JSON.stringify(f.ubicacion), f.area_ha]);
      }
      for (const l of datos.lotes) {
        await bd.query(
          `INSERT INTO lote (id, productor_id, finca_id, nombre, cantidad_animales, peso_promedio_kg, categoria, raza, finca, municipio_origen, creado_en, actualizado_en)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
          [l.id, l.productor_id, l.finca_id, l.nombre, l.cantidad_animales, l.peso_promedio_kg, l.categoria, l.raza, l.finca, l.municipio_origen, l.creado_en]);
      }
      for (const s of datos.simulaciones) {
        const { rows: [lote] } = await bd.query(`SELECT ${COL_LOTE} FROM lote WHERE id = $1`, [s.lote_id]);
        await calcularYGuardar(bd, lote, s, s.creado_en);
      }
      for (const l of datos.lotes.filter((x) => x.estado === 'vendido')) {
        await bd.query(`UPDATE lote SET estado = 'vendido' WHERE id = $1`, [l.id]);
      }
    });
    log(`✔ Datos de demostración cargados: ${datos.productores.length} productores, ${datos.fincas.length} fincas, ${datos.destinos.length} destinos, `
      + `${datos.precios.length} precios, ${datos.lotes.length} lotes y ${datos.simulaciones.length} simulaciones.`);
    log(`  Cuentas: ${CORREO_ADMIN_DEMO} (administrador) y ${datos.productores.map((p) => p.correo).join(', ')} (productores).`);
    log('  Contraseña de todas: la que puso en CONTRASENA_DEMO.');
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.CONTRASENA_DEMO) {
    console.log('CONTRASENA_DEMO no está definida: no se cargan datos de demostración.');
    process.exit(0);
  }
  sembrar(process.env.DATABASE_URL, process.env.CONTRASENA_DEMO, { forzar: process.argv.includes('--forzar') })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
