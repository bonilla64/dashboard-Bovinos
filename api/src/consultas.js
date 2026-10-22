// Columnas que devuelve cada recurso, ya con la forma del contrato (GeoJSON incluido).
import { HOY_COLOMBIA } from './bd.js';

export const COL_PRODUCTOR = `id, tipo_persona, tipo_documento, numero_documento, representante_legal, nombre_completo,
  departamento, municipio, vereda, telefono, correo, documento_verificado, acepta_datos_en, creado_en, actualizado_en`;
export const COL_USUARIO = `id, nombre_completo, correo, rol, productor_id, activo, debe_cambiar_contrasena, ultimo_ingreso,
  creado_en, actualizado_en`;
/** Usuario con su ficha de productor anidada (esquema UsuarioDetalle). Se usa con «FROM usuario u». */
export const COL_USUARIO_DETALLE = `u.id, u.nombre_completo, u.correo, u.rol, u.productor_id, u.activo,
  u.debe_cambiar_contrasena, u.ultimo_ingreso, u.creado_en, u.actualizado_en,
  (SELECT to_jsonb(p) FROM (SELECT ${COL_PRODUCTOR} FROM productor WHERE productor.id = u.productor_id) p) AS productor`;
export const COL_LOTE = `id, productor_id, finca_id, nombre, cantidad_animales, peso_promedio_kg, peso_total_kg, categoria,
  raza, finca, municipio_origen, estado, (SELECT count(*) FROM simulacion s WHERE s.lote_id = lote.id) AS simulaciones,
  creado_en, actualizado_en`;
export const COL_FINCA = `id, productor_id, nombre, departamento, municipio, vereda, ST_AsGeoJSON(ubicacion, 6)::json AS ubicacion,
  area_ha, activo, (SELECT count(*) FROM lote l WHERE l.finca_id = finca.id) AS lotes, creado_en, actualizado_en`;
export const COL_DESTINO = `id, nombre, tipo, municipio, departamento, ST_AsGeoJSON(ubicacion, 6)::json AS ubicacion,
  comision_pct, activo, creado_en, actualizado_en`;
export const COL_PRECIO = `id, destino_id, categoria, precio_kg_cop, to_char(fecha, 'YYYY-MM-DD') AS fecha, fuente,
  referencia, importacion_id, (${HOY_COLOMBIA} - fecha) AS antiguedad_dias, creado_en, actualizado_en`;
export const COL_IMPORTACION = 'id, fuente, origen, filas, insertados, actualizados, sin_cambios, usuario_id, creado_en, actualizado_en';
export const COL_RUTA = `id, destino_id, origen_nombre, ST_AsGeoJSON(origen, 6)::json AS origen, distancia_km,
  tiempo_horas, peajes_cop, factor_dificultad, merma_pct, ST_AsGeoJSON(geometria, 6)::json AS geometria, fuente,
  creado_en, actualizado_en`;
export const COL_SIMULACION = `id, lote_id, flete_km_cop, capacidad_camion, flete_incluye_peajes, mejor_destino_id,
  creado_en, actualizado_en`;
export const COL_RESULTADO = `id, simulacion_id, destino_id, ruta_id, distancia_km, tiempo_horas, merma_pct, camiones,
  peso_vendido_kg, precio_kg_cop, to_char(precio_fecha, 'YYYY-MM-DD') AS precio_fecha, precio_antiguedad_dias, advertencia,
  comision_cop, flete_cop, peajes_cop, costo_logistico_cop, ingreso_bruto_cop,
  utilidad_neta_cop, posicion, creado_en, actualizado_en`;

const GEOMETRIAS = new Set(['ubicacion', 'origen', 'geometria']);

/**
 * Arma un UPDATE solo con los campos permitidos que llegaron en `cambios`.
 * Los nombres de columna salen de la lista blanca, nunca del usuario; los valores van como parámetros.
 */
export async function actualizarFila(bd, tabla, id, cambios, permitidos, columnas) {
  const sets = [];
  const valores = [];
  for (const campo of permitidos) {
    if (!(campo in cambios)) continue;
    if (GEOMETRIAS.has(campo) && cambios[campo] === null) { sets.push(`${campo} = NULL`); continue; }
    valores.push(GEOMETRIAS.has(campo) ? JSON.stringify(cambios[campo]) : cambios[campo]);
    sets.push(GEOMETRIAS.has(campo)
      ? `${campo} = ST_SetSRID(ST_GeomFromGeoJSON($${valores.length}), 4326)`
      : `${campo} = $${valores.length}`);
  }
  if (!sets.length) return null;
  valores.push(id);
  const { rows } = await bd.query(
    `UPDATE ${tabla} SET ${sets.join(', ')} WHERE id = $${valores.length} RETURNING ${columnas}`, valores);
  return rows[0] || null;
}

export function paginar(consulta) {
  const pagina = consulta.pagina ?? 1;
  const porPagina = consulta.por_pagina ?? 20;
  return { pagina, porPagina, limite: porPagina, desplazamiento: (pagina - 1) * porPagina };
}
