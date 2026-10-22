// Fincas: predios de cada productor. Un lote sale de una finca, y de ella toma el municipio de origen de la ruta.
import { enTransaccion } from '../bd.js';
import { COL_FINCA, paginar } from '../consultas.js';
import { esAdmin, exigirDueno } from '../auth.js';
import { anotar, camposCambiados } from '../bitacora.js';
import { distanciaACabecera, MAX_KM_A_CABECERA } from '../identidad.js';
import { conflicto, noEncontrado, prohibido, validacion } from '../errores.js';

/** La ubicación debe quedar razonablemente cerca de la cabecera del municipio declarado. */
function revisarUbicacion(municipio, ubicacion) {
  if (!ubicacion) return;
  const km = distanciaACabecera(municipio, ubicacion);
  if (km !== null && km > MAX_KM_A_CABECERA) {
    throw validacion(`La ubicación queda a ${Math.round(km)} km de ${municipio}; revise el punto o el municipio.`,
      [{ campo: 'ubicacion', problema: `Más de ${MAX_KM_A_CABECERA} km de la cabecera municipal.` }]);
  }
}

export default ({ pool }) => {
  async function buscarPropia(bd, peticion) {
    const { rows } = await bd.query(`SELECT ${COL_FINCA} FROM finca WHERE id = $1`, [peticion.params.finca_id]);
    if (!rows[0]) throw noEncontrado('No existe esa finca.');
    exigirDueno(peticion.user, rows[0].productor_id, 'esta finca');
    return rows[0];
  }
  async function nombreLibre(bd, productorId, nombre, excepto = null) {
    const { rowCount } = await bd.query(
      'SELECT 1 FROM finca WHERE productor_id = $1 AND lower(nombre) = lower($2) AND id IS DISTINCT FROM $3',
      [productorId, nombre.trim(), excepto]);
    if (rowCount) throw conflicto('Ya tiene una finca con ese nombre.', [{ campo: 'nombre', problema: 'Nombre repetido.' }]);
  }

  return {
    async listarFincas(peticion) {
      const q = peticion.query;
      const { pagina, porPagina, limite, desplazamiento } = paginar(q);
      const productor = esAdmin(peticion.user) ? (q.productor_id ?? null) : peticion.user.productor_id;
      const { rows } = await pool.query(
        `SELECT ${COL_FINCA}, count(*) OVER () AS total FROM finca
         WHERE ($1::uuid IS NULL OR productor_id = $1) AND ($2::boolean IS NULL OR activo = $2)
         ORDER BY activo DESC, nombre LIMIT $3 OFFSET $4`,
        [productor, q.activo ?? null, limite, desplazamiento]);
      const total = rows[0]?.total ?? 0;
      rows.forEach((r) => delete r.total);
      return { datos: rows, pagina, por_pagina: porPagina, total };
    },

    async crearFinca(peticion, respuesta) {
      const b = peticion.body;
      let productorId = b.productor_id;
      if (esAdmin(peticion.user)) {
        if (!productorId) throw validacion('Indique a qué productor pertenece la finca.', [{ campo: 'productor_id', problema: 'Falta el campo.' }]);
      } else {
        if (productorId && productorId !== peticion.user.productor_id) throw prohibido('Solo puede registrar fincas a su nombre.');
        productorId = peticion.user.productor_id;
      }
      const existe = await pool.query('SELECT 1 FROM productor WHERE id = $1', [productorId]);
      if (!existe.rowCount) throw validacion('El productor indicado no existe.', [{ campo: 'productor_id', problema: 'Productor inexistente.' }]);
      await nombreLibre(pool, productorId, b.nombre);
      revisarUbicacion(b.municipio, b.ubicacion);
      const { rows } = await pool.query(
        `INSERT INTO finca (productor_id, nombre, municipio, vereda, ubicacion, area_ha)
         VALUES ($1, $2, $3, $4, CASE WHEN $5::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($5), 4326) END, $6)
         RETURNING ${COL_FINCA}`,
        [productorId, b.nombre.trim(), b.municipio, b.vereda ?? null, b.ubicacion ? JSON.stringify(b.ubicacion) : null, b.area_ha ?? null]);
      if (esAdmin(peticion.user)) await anotar(pool, peticion.user, 'crear', 'finca', rows[0].id, { productor_id: productorId, nombre: b.nombre });
      respuesta.code(201).header('Location', `/api/v1/fincas/${rows[0].id}`);
      return rows[0];
    },

    async obtenerFinca(peticion) {
      return buscarPropia(pool, peticion);
    },

    async actualizarFinca(peticion) {
      const b = peticion.body;
      return enTransaccion(pool, async (bd) => {
        const finca = await buscarPropia(bd, peticion);
        if (b.nombre) await nombreLibre(bd, finca.productor_id, b.nombre, finca.id);
        const municipio = b.municipio ?? finca.municipio;
        const ubicacion = 'ubicacion' in b ? b.ubicacion : finca.ubicacion;
        if ('municipio' in b || 'ubicacion' in b) revisarUbicacion(municipio, ubicacion);

        const sets = [];
        const valores = [];
        for (const campo of ['nombre', 'municipio', 'vereda', 'area_ha', 'activo']) {
          if (!(campo in b)) continue;
          valores.push(campo === 'nombre' ? b.nombre.trim() : b[campo]);
          sets.push(`${campo} = $${valores.length}`);
        }
        if ('ubicacion' in b) {
          if (b.ubicacion === null) sets.push('ubicacion = NULL');
          else { valores.push(JSON.stringify(b.ubicacion)); sets.push(`ubicacion = ST_SetSRID(ST_GeomFromGeoJSON($${valores.length}), 4326)`); }
        }
        valores.push(finca.id);
        await bd.query(`UPDATE finca SET ${sets.join(', ')} WHERE id = $${valores.length}`, valores);
        // Los lotes de la finca llevan su nombre y salen de su municipio: se mantienen al día.
        if (b.nombre || b.municipio) {
          await bd.query(
            `UPDATE lote SET finca = COALESCE($1, finca), municipio_origen = COALESCE($2, municipio_origen)
             WHERE finca_id = $3 AND estado <> 'vendido'`,
            [b.nombre?.trim() ?? null, b.municipio ?? null, finca.id]);
        }
        if (esAdmin(peticion.user)) await anotar(bd, peticion.user, 'actualizar', 'finca', finca.id, { campos: camposCambiados(b) });
        const { rows } = await bd.query(`SELECT ${COL_FINCA} FROM finca WHERE id = $1`, [finca.id]);
        return rows[0];
      });
    },

    async eliminarFinca(peticion, respuesta) {
      const finca = await buscarPropia(pool, peticion);
      if (finca.lotes > 0) {
        throw conflicto(`La finca tiene ${finca.lotes} lotes registrados. Desactívela (activo = false) en lugar de eliminarla.`,
          [{ campo: 'activo', problema: 'Use la desactivación.' }]);
      }
      await pool.query('DELETE FROM finca WHERE id = $1', [finca.id]);
      if (esAdmin(peticion.user)) await anotar(pool, peticion.user, 'eliminar', 'finca', finca.id, { nombre: finca.nombre });
      return respuesta.code(204).send();
    },
  };
};
