// Importación de precios por lotes desde una hoja de cálculo (CSV).
// La usan POST /precios/importacion (carga manual del administrador) y
// scripts/sincronizar-precios.js (carga programada cada 3 días desde la hoja publicada).
//
// Columnas de la hoja (la primera fila son los encabezados; el orden no importa):
//   destino        nombre exacto del destino en la API, o su id
//   categoria      novillo_gordo | vaca_gorda | novillo_levante | ternero_destete | toro
//   precio_kg_cop  precio por kilo en pie, en pesos (acepta "10.400", "$10,400" o "10400")
//   fecha          fecha del dato, AAAA-MM-DD o DD/MM/AAAA
//   fuente         de dónde salió (por ejemplo «Fedegán – precios semanales de ganado gordo»)
//   referencia     opcional: enlace o nombre del indicador / plaza en el boletín de Fedegán
// Las filas con la columna destino vacía se ignoran (sirven de comentario).

import { parse } from 'csv-parse/sync';
import { enTransaccion } from '../bd.js';
import { COL_IMPORTACION } from '../consultas.js';
import { validacion } from '../errores.js';

export const CATEGORIAS = ['novillo_gordo', 'vaca_gorda', 'novillo_levante', 'ternero_destete', 'toro'];
const OBLIGATORIAS = ['destino', 'categoria', 'precio_kg_cop', 'fecha', 'fuente'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizarEncabezado = (h) => h.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, '_');

/** Convierte el texto CSV (separado por coma o por punto y coma, como lo exporta Excel en español) en filas. */
export function leerCsv(texto) {
  const limpio = String(texto ?? '').replace(/^﻿/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] || '';
  const delimitador = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  let filas;
  try {
    filas = parse(limpio, { columns: (cab) => cab.map(normalizarEncabezado), delimiter: delimitador, skip_empty_lines: true, trim: true, relax_column_count: true });
  } catch (e) {
    throw validacion('El archivo no es un CSV válido.', [{ campo: '(archivo)', problema: e.message }]);
  }
  if (!filas.length) throw validacion('El archivo no tiene filas de precios.', [{ campo: '(archivo)', problema: 'Vacío.' }]);
  const faltantes = OBLIGATORIAS.filter((c) => !(c in filas[0]));
  if (faltantes.length) {
    throw validacion('Faltan columnas en el archivo.', faltantes.map((c) => ({ campo: c, problema: 'Columna obligatoria.' })));
  }
  return filas.filter((f) => f.destino);
}

function leerFecha(texto) {
  const t = String(texto || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/**
 * Valida todas las filas y, si ninguna tiene errores, guarda en una sola transacción.
 * Si alguna fila falla no se guarda nada (todo o nada) y se informa fila por fila.
 */
export async function importarPrecios(pool, filas, { origen = 'manual', usuarioId = null, fuentePorDefecto = null } = {}) {
  const { rows: destinos } = await pool.query('SELECT id, lower(nombre) AS nombre FROM destino');
  const porNombre = new Map(destinos.map((d) => [d.nombre, d.id]));
  const ids = new Set(destinos.map((d) => d.id));
  const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10); // fecha de Colombia (UTC−5)

  const problemas = [];
  const validas = [];
  filas.forEach((f, i) => {
    const fila = `fila ${i + 2}`; // +2: la fila 1 son los encabezados
    const destinoTexto = String(f.destino).trim();
    const destinoId = UUID.test(destinoTexto) ? (ids.has(destinoTexto) ? destinoTexto : null) : porNombre.get(destinoTexto.toLowerCase());
    const categoria = String(f.categoria || '').trim().toLowerCase().replace(/\s+/g, '_');
    const precio = Number(String(f.precio_kg_cop || '').replace(/[^\d]/g, ''));
    const fecha = leerFecha(f.fecha);
    const fuente = String(f.fuente || fuentePorDefecto || '').trim();
    const antes = problemas.length;
    if (!destinoId) problemas.push({ campo: `${fila}.destino`, problema: `No existe un destino llamado «${destinoTexto}».` });
    if (!CATEGORIAS.includes(categoria)) problemas.push({ campo: `${fila}.categoria`, problema: `Debe ser uno de: ${CATEGORIAS.join(', ')}.` });
    if (!(precio >= 3000 && precio <= 30000)) problemas.push({ campo: `${fila}.precio_kg_cop`, problema: 'Debe estar entre 3.000 y 30.000 pesos por kilo.' });
    if (!fecha) problemas.push({ campo: `${fila}.fecha`, problema: 'Use AAAA-MM-DD o DD/MM/AAAA.' });
    else if (fecha > hoy) problemas.push({ campo: `${fila}.fecha`, problema: 'La fecha no puede ser futura.' });
    if (fuente.length < 3) problemas.push({ campo: `${fila}.fuente`, problema: 'Indique de dónde salió el precio.' });
    if (problemas.length === antes) {
      validas.push({ destinoId, categoria, precio, fecha, fuente: fuente.slice(0, 160), referencia: f.referencia ? String(f.referencia).slice(0, 300) : null });
    }
  });
  const claves = new Set();
  validas.forEach((v, i) => {
    const clave = `${v.destinoId}|${v.categoria}|${v.fecha}`;
    if (claves.has(clave)) problemas.push({ campo: `fila ${i + 2}`, problema: 'Repite destino, categoría y fecha de otra fila.' });
    claves.add(clave);
  });
  if (problemas.length) throw validacion(`El archivo tiene ${problemas.length} problema(s); no se guardó ningún precio.`, problemas);

  return enTransaccion(pool, async (bd) => {
    const { rows: [imp] } = await bd.query(
      `INSERT INTO importacion_precio (fuente, origen, filas, insertados, actualizados, sin_cambios, usuario_id)
       VALUES ($1, $2, $3, 0, 0, 0, $4) RETURNING id`,
      [[...new Set(validas.map((v) => v.fuente))].join(' · ').slice(0, 160), origen, validas.length, usuarioId]);
    const cuenta = { insertados: 0, actualizados: 0, sin_cambios: 0 };
    for (const v of validas) {
      const { rows: [previo] } = await bd.query(
        'SELECT id, precio_kg_cop, fuente, referencia FROM precio_mercado WHERE destino_id = $1 AND categoria = $2 AND fecha = $3',
        [v.destinoId, v.categoria, v.fecha]);
      if (!previo) {
        await bd.query(
          `INSERT INTO precio_mercado (destino_id, categoria, precio_kg_cop, fecha, fuente, referencia, importacion_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`, [v.destinoId, v.categoria, v.precio, v.fecha, v.fuente, v.referencia, imp.id]);
        cuenta.insertados += 1;
      } else if (previo.precio_kg_cop !== v.precio || previo.fuente !== v.fuente || (previo.referencia ?? null) !== v.referencia) {
        await bd.query('UPDATE precio_mercado SET precio_kg_cop = $1, fuente = $2, referencia = $3, importacion_id = $4 WHERE id = $5',
          [v.precio, v.fuente, v.referencia, imp.id, previo.id]);
        cuenta.actualizados += 1;
      } else {
        cuenta.sin_cambios += 1;
      }
    }
    const { rows: [final] } = await bd.query(
      `UPDATE importacion_precio SET insertados = $1, actualizados = $2, sin_cambios = $3 WHERE id = $4 RETURNING ${COL_IMPORTACION}`,
      [cuenta.insertados, cuenta.actualizados, cuenta.sin_cambios, imp.id]);
    return final;
  });
}

/** Destinos activos cuyo último precio de una categoría que sí compran tiene más de `dias` días. */
export async function preciosVencidos(pool, dias) {
  const { rows } = await pool.query(
    `SELECT d.nombre, p.categoria, to_char(max(p.fecha), 'YYYY-MM-DD') AS ultima_fecha, current_date - max(p.fecha) AS dias
     FROM destino d JOIN precio_mercado p ON p.destino_id = d.id
     WHERE d.activo GROUP BY d.nombre, p.categoria HAVING current_date - max(p.fecha) > $1
     ORDER BY dias DESC, d.nombre`, [dias]);
  return rows;
}
