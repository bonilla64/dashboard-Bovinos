import { enTransaccion } from '../bd.js';
import { COL_LOTE, COL_RESULTADO, COL_SIMULACION, paginar } from '../consultas.js';
import { esAdmin, exigirDueno } from '../auth.js';
import { calcularResultado, ordenarResultados } from '../calculo.js';
import { noEncontrado, validacion } from '../errores.js';
import { rutaDesde } from '../geo/origenes.js';

/**
 * Calcula y guarda una simulación dentro de la transacción `bd`.
 * Lo usan la ruta POST /simulaciones y el script de datos de demostración, así ambos calculan igual.
 */
export async function calcularYGuardar(bd, lote, entrada, creadoEn = null, vigencia = { advertencia: 7, maximo: 30 }, opciones = {}) {
  const parametros = {
    flete_km_cop: entrada.flete_km_cop,
    capacidad_camion: entrada.capacidad_camion ?? 25,
    flete_incluye_peajes: entrada.flete_incluye_peajes ?? false,
  };
  const problemas = [];
  const filas = [];
  for (const [i, destinoId] of entrada.destino_ids.entries()) {
    const campo = `destino_ids[${i}]`;
    const { rows: [destino] } = await bd.query(
      'SELECT id, nombre, tipo, activo, comision_pct, ST_AsGeoJSON(ubicacion)::json AS ubicacion FROM destino WHERE id = $1', [destinoId]);
    if (!destino) { problemas.push({ campo, problema: 'El destino no existe.' }); continue; }
    if (!destino.activo) { problemas.push({ campo, problema: `${destino.nombre} está desactivado.` }); continue; }
    // Ruta desde el municipio del lote; si aún no existe, se calcula y se guarda (src/geo/origenes.js).
    const ruta = await rutaDesde(bd, lote.municipio_origen, destino, opciones);
    if (!ruta) { problemas.push({ campo, problema: `${destino.nombre} no tiene ruta registrada.` }); continue; }
    // Precio vigente: el más reciente que no sea posterior al día de la simulación.
    const { rows: [precio] } = await bd.query(
      `SELECT precio_kg_cop, to_char(fecha, 'YYYY-MM-DD') AS fecha,
              (COALESCE($3::timestamptz, now())::date - fecha) AS antiguedad
       FROM precio_mercado
       WHERE destino_id = $1 AND categoria = $2 AND fecha <= COALESCE($3::timestamptz, now())::date
       ORDER BY fecha DESC LIMIT 1`, [destinoId, lote.categoria, creadoEn]);
    if (!precio) { problemas.push({ campo, problema: `${destino.nombre} no tiene precio vigente para ${lote.categoria}.` }); continue; }
    if (precio.antiguedad > vigencia.maximo) {
      problemas.push({ campo, problema: `El precio de ${lote.categoria} en ${destino.nombre} es de hace ${precio.antiguedad} días (máximo ${vigencia.maximo}). Actualice los precios.` });
      continue;
    }
    const advertencia = precio.antiguedad > vigencia.advertencia
      ? `Precio de hace ${precio.antiguedad} días (${precio.fecha}); puede no reflejar el mercado actual.` : null;
    filas.push({
      destino_id: destinoId, ruta_id: ruta.id, precio_fecha: precio.fecha, precio_antiguedad_dias: precio.antiguedad, advertencia,
      ...calcularResultado(lote, parametros, destino, ruta, precio.precio_kg_cop),
    });
  }
  if (problemas.length) throw validacion('No se puede calcular la utilidad para uno o más de los destinos elegidos.', problemas);

  ordenarResultados(filas);
  const { rows: [simulacion] } = await bd.query(
    `INSERT INTO simulacion (lote_id, flete_km_cop, capacidad_camion, flete_incluye_peajes, mejor_destino_id, creado_en, actualizado_en)
     VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, now()), COALESCE($6::timestamptz, now())) RETURNING ${COL_SIMULACION}`,
    [lote.id, parametros.flete_km_cop, parametros.capacidad_camion, parametros.flete_incluye_peajes, filas[0].destino_id, creadoEn]);
  simulacion.resultados = [];
  for (const f of filas) {
    const { rows: [r] } = await bd.query(
      `INSERT INTO resultado_simulacion (simulacion_id, destino_id, ruta_id, distancia_km, tiempo_horas, merma_pct, camiones,
         peso_vendido_kg, precio_kg_cop, comision_cop, flete_cop, peajes_cop, costo_logistico_cop, ingreso_bruto_cop,
         utilidad_neta_cop, posicion, precio_fecha, precio_antiguedad_dias, advertencia, creado_en, actualizado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, $20, $20) RETURNING ${COL_RESULTADO}`,
      [simulacion.id, f.destino_id, f.ruta_id, f.distancia_km, f.tiempo_horas, f.merma_pct, f.camiones, f.peso_vendido_kg,
        f.precio_kg_cop, f.comision_cop, f.flete_cop, f.peajes_cop, f.costo_logistico_cop, f.ingreso_bruto_cop,
        f.utilidad_neta_cop, f.posicion, f.precio_fecha, f.precio_antiguedad_dias, f.advertencia, simulacion.creado_en]);
    simulacion.resultados.push(r);
  }
  await bd.query(`UPDATE lote SET estado = 'simulado' WHERE id = $1 AND estado = 'disponible'`, [lote.id]);
  return simulacion;
}

export default ({ pool, config }) => {
  async function conResultados(simulaciones) {
    if (!simulaciones.length) return simulaciones;
    const { rows } = await pool.query(
      `SELECT ${COL_RESULTADO} FROM resultado_simulacion WHERE simulacion_id = ANY($1) ORDER BY posicion`,
      [simulaciones.map((s) => s.id)]);
    for (const s of simulaciones) s.resultados = rows.filter((r) => r.simulacion_id === s.id);
    return simulaciones;
  }

  async function buscarPropia(peticion) {
    const { rows } = await pool.query(
      `SELECT ${COL_SIMULACION.split(',').map((c) => `s.${c.trim()}`).join(', ')}, l.productor_id
       FROM simulacion s JOIN lote l ON l.id = s.lote_id WHERE s.id = $1`, [peticion.params.simulacion_id]);
    if (!rows[0]) throw noEncontrado('No existe esa simulación.');
    exigirDueno(peticion.user, rows[0].productor_id, 'esta simulación');
    delete rows[0].productor_id;
    return rows[0];
  }

  return {
    async listarSimulaciones(peticion) {
      const q = peticion.query;
      const { pagina, porPagina, limite, desplazamiento } = paginar(q);
      const productor = esAdmin(peticion.user) ? null : peticion.user.productor_id;
      const { rows } = await pool.query(
        `SELECT ${COL_SIMULACION.split(',').map((c) => `s.${c.trim()}`).join(', ')}, count(*) OVER () AS total
         FROM simulacion s JOIN lote l ON l.id = s.lote_id
         WHERE ($1::uuid IS NULL OR l.productor_id = $1)
           AND ($2::uuid IS NULL OR s.lote_id = $2)
           AND ($3::date IS NULL OR s.creado_en >= $3)
         ORDER BY s.creado_en DESC LIMIT $4 OFFSET $5`,
        [productor, q.lote_id ?? null, q.desde ?? null, limite, desplazamiento]);
      const total = rows[0]?.total ?? 0;
      rows.forEach((r) => delete r.total);
      return { datos: await conResultados(rows), pagina, por_pagina: porPagina, total };
    },

    async crearSimulacion(peticion, respuesta) {
      const { rows: [lote] } = await pool.query(`SELECT ${COL_LOTE} FROM lote WHERE id = $1`, [peticion.body.lote_id]);
      if (!lote) {
        throw noEncontrado(`No existe un lote con id ${peticion.body.lote_id}.`, [{ campo: 'lote_id', problema: 'Lote inexistente.' }]);
      }
      exigirDueno(peticion.user, lote.productor_id, 'este lote');
      const simulacion = await enTransaccion(pool, (bd) => calcularYGuardar(bd, lote, peticion.body, null, config.vigenciaPrecios, { osrmBaseUrl: config.osrmBaseUrl }));
      respuesta.code(201).header('Location', `/api/v1/simulaciones/${simulacion.id}`);
      return simulacion;
    },

    async obtenerSimulacion(peticion) {
      const simulacion = await buscarPropia(peticion);
      return (await conResultados([simulacion]))[0];
    },

    async eliminarSimulacion(peticion, respuesta) {
      const simulacion = await buscarPropia(peticion);
      await pool.query('DELETE FROM simulacion WHERE id = $1', [simulacion.id]);
      return respuesta.code(204).send();
    },
  };
};
