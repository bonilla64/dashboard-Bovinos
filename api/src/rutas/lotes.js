import { COL_LOTE, actualizarFila, paginar } from '../consultas.js';
import { esAdmin, exigirDueno } from '../auth.js';
import { conflicto, noEncontrado, prohibido, validacion } from '../errores.js';

const EDITABLES = ['finca_id', 'nombre', 'cantidad_animales', 'peso_promedio_kg', 'categoria', 'raza', 'finca', 'municipio_origen', 'estado'];
const ORDENES = { creado_en: 'creado_en ASC', '-creado_en': 'creado_en DESC', peso_total_kg: 'peso_total_kg ASC', '-peso_total_kg': 'peso_total_kg DESC' };

export default ({ pool }) => {
  /**
   * Si el lote indica finca: debe ser del mismo productor y estar activa (salvo que sea la que ya tenía).
   * El nombre de la finca y el municipio de origen se toman de ella. Devuelve los campos a guardar.
   */
  async function datosDeFinca(productorId, fincaId, { actual = null } = {}) {
    if (!fincaId) return {};
    const { rows: [finca] } = await pool.query('SELECT id, productor_id, nombre, municipio, activo FROM finca WHERE id = $1', [fincaId]);
    if (!finca) throw validacion('La finca indicada no existe.', [{ campo: 'finca_id', problema: 'Finca inexistente.' }]);
    if (finca.productor_id !== productorId) {
      throw validacion('La finca es de otro productor.', [{ campo: 'finca_id', problema: 'No pertenece al productor del lote.' }]);
    }
    if (!finca.activo && finca.id !== actual) {
      throw validacion(`La finca ${finca.nombre} está desactivada.`, [{ campo: 'finca_id', problema: 'Finca inactiva.' }]);
    }
    return { finca: finca.nombre, municipio_origen: finca.municipio };
  }

  async function buscarPropio(peticion) {
    const { rows } = await pool.query(`SELECT ${COL_LOTE} FROM lote WHERE id = $1`, [peticion.params.lote_id]);
    if (!rows[0]) throw noEncontrado('No existe ese lote.');
    exigirDueno(peticion.user, rows[0].productor_id, 'este lote');
    return rows[0];
  }

  return {
    async listarLotes(peticion) {
      const q = peticion.query;
      const { pagina, porPagina, limite, desplazamiento } = paginar(q);
      // Un productor solo ve lo suyo, aunque pida otro productor_id.
      const productor = esAdmin(peticion.user) ? (q.productor_id ?? null) : peticion.user.productor_id;
      const { rows } = await pool.query(
        `SELECT ${COL_LOTE}, count(*) OVER () AS total FROM lote
         WHERE ($1::uuid IS NULL OR productor_id = $1)
           AND ($2::estado_lote IS NULL OR estado = $2)
           AND ($3::categoria_animal IS NULL OR categoria = $3)
           AND ($6::uuid IS NULL OR finca_id = $6)
         ORDER BY ${ORDENES[q.orden ?? '-creado_en']} LIMIT $4 OFFSET $5`,
        [productor, q.estado ?? null, q.categoria ?? null, limite, desplazamiento, q.finca_id ?? null]);
      const total = rows[0]?.total ?? 0;
      rows.forEach((r) => delete r.total);
      return { datos: rows, pagina, por_pagina: porPagina, total };
    },

    async crearLote(peticion, respuesta) {
      const b = peticion.body;
      let productorId = b.productor_id;
      if (esAdmin(peticion.user)) {
        if (!productorId) throw validacion('Indique a qué productor pertenece el lote.', [{ campo: 'productor_id', problema: 'Falta el campo.' }]);
      } else {
        if (productorId && productorId !== peticion.user.productor_id) throw prohibido('Solo puede registrar lotes a su nombre.');
        productorId = peticion.user.productor_id;
      }
      const existe = await pool.query('SELECT 1 FROM productor WHERE id = $1', [productorId]);
      if (!existe.rowCount) throw validacion('El productor indicado no existe.', [{ campo: 'productor_id', problema: 'Productor inexistente.' }]);
      const deFinca = await datosDeFinca(productorId, b.finca_id);
      const municipio = deFinca.municipio_origen ?? b.municipio_origen;
      if (!municipio) {
        throw validacion('Indique la finca del lote o su municipio de origen.', [{ campo: 'finca_id', problema: 'Falta la finca o el municipio de origen.' }]);
      }
      const { rows } = await pool.query(
        `INSERT INTO lote (productor_id, finca_id, nombre, cantidad_animales, peso_promedio_kg, categoria, raza, finca, municipio_origen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${COL_LOTE}`,
        [productorId, b.finca_id ?? null, b.nombre, b.cantidad_animales, b.peso_promedio_kg, b.categoria, b.raza ?? null,
          deFinca.finca ?? b.finca ?? null, municipio]);
      respuesta.code(201).header('Location', `/api/v1/lotes/${rows[0].id}`);
      return rows[0];
    },

    async obtenerLote(peticion) {
      return buscarPropio(peticion);
    },

    async actualizarLote(peticion) {
      const lote = await buscarPropio(peticion);
      const cambios = { ...peticion.body };
      const fincaFinal = 'finca_id' in cambios ? cambios.finca_id : lote.finca_id;
      if (fincaFinal && 'municipio_origen' in cambios && !('finca_id' in cambios)) {
        throw validacion('El municipio de origen sale de la finca del lote; cambie la finca o el municipio de la finca.',
          [{ campo: 'municipio_origen', problema: 'Lo define la finca.' }]);
      }
      if ('finca_id' in cambios && cambios.finca_id) {
        Object.assign(cambios, await datosDeFinca(lote.productor_id, cambios.finca_id, { actual: lote.finca_id }));
      } else if (fincaFinal && 'finca' in cambios) {
        delete cambios.finca; // el nombre lo pone la finca
      }
      return actualizarFila(pool, 'lote', lote.id, cambios, EDITABLES, COL_LOTE);
    },

    async eliminarLote(peticion, respuesta) {
      const lote = await buscarPropio(peticion);
      const { rows } = await pool.query('SELECT count(*) AS n FROM simulacion WHERE lote_id = $1', [lote.id]);
      if (rows[0].n > 0) {
        throw conflicto(`El lote tiene ${rows[0].n} simulaciones guardadas. Márquelo como vendido en lugar de eliminarlo.`);
      }
      await pool.query('DELETE FROM lote WHERE id = $1', [lote.id]);
      return respuesta.code(204).send();
    },
  };
};
