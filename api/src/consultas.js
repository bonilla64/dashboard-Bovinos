// Columnas que devuelve cada recurso, ya con la forma del contrato (GeoJSON incluido).

export const COL_PRODUCTOR = 'id, nombre_completo, municipio, telefono, correo, creado_en, actualizado_en';
export const COL_USUARIO = 'id, nombre_completo, correo, rol, productor_id, creado_en, actualizado_en';
export const COL_LOTE = `id, productor_id, nombre, cantidad_animales, peso_promedio_kg, peso_total_kg, categoria,
  raza, finca, municipio_origen, estado, creado_en, actualizado_en`;
export const COL_DESTINO = `id, nombre, tipo, municipio, departamento, ST_AsGeoJSON(ubicacion, 6)::json AS ubicacion,
  comision_pct, activo, creado_en, actualizado_en`;
export const COL_PRECIO = `id, destino_id, categoria, precio_kg_cop, to_char(fecha, 'YYYY-MM-DD') AS fecha, fuente,
  referencia, importacion_id, (current_date - fecha) AS antiguedad_dias, creado_en, actualizado_en`;
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
