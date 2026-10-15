import { COL_LOTE, actualizarFila, paginar } from '../consultas.js';
import { esAdmin, exigirDueno } from '../auth.js';
import { conflicto, noEncontrado, prohibido, validacion } from '../errores.js';

const EDITABLES = ['nombre', 'cantidad_animales', 'peso_promedio_kg', 'categoria', 'raza', 'finca', 'municipio_origen', 'estado'];
const ORDENES = { creado_en: 'creado_en ASC', '-creado_en': 'creado_en DESC', peso_total_kg: 'peso_total_kg ASC', '-peso_total_kg': 'peso_total_kg DESC' };

export default ({ pool }) => {
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
         ORDER BY ${ORDENES[q.orden ?? '-creado_en']} LIMIT $4 OFFSET $5`,
        [productor, q.estado ?? null, q.categoria ?? null, limite, desplazamiento]);
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
      const { rows } = await pool.query(
        `INSERT INTO lote (productor_id, nombre, cantidad_animales, peso_promedio_kg, categoria, raza, finca, municipio_origen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${COL_LOTE}`,
        [productorId, b.nombre, b.cantidad_animales, b.peso_promedio_kg, b.categoria, b.raza ?? null, b.finca ?? null, b.municipio_origen]);
      respuesta.code(201).header('Location', `/api/v1/lotes/${rows[0].id}`);
      return rows[0];
    },

    async obtenerLote(peticion) {
      return buscarPropio(peticion);
    },

    async actualizarLote(peticion) {
      const lote = await buscarPropio(peticion);
      return actualizarFila(pool, 'lote', lote.id, peticion.body, EDITABLES, COL_LOTE);
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
