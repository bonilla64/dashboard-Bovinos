import { COL_PRODUCTOR, actualizarFila, paginar } from '../consultas.js';
import { exigirDueno } from '../auth.js';
import { conflicto, noEncontrado } from '../errores.js';

const EDITABLES = ['nombre_completo', 'municipio', 'telefono', 'correo'];

export default ({ pool }) => {
  async function buscar(id) {
    const { rows } = await pool.query(`SELECT ${COL_PRODUCTOR} FROM productor WHERE id = $1`, [id]);
    if (!rows[0]) throw noEncontrado('No existe ese productor.');
    return rows[0];
  }
  async function correoLibre(correo, excepto = null) {
    if (!correo) return;
    const { rowCount } = await pool.query(
      'SELECT 1 FROM productor WHERE lower(correo) = lower($1) AND id IS DISTINCT FROM $2', [correo, excepto]);
    if (rowCount) throw conflicto('Ya hay un productor con ese correo.', [{ campo: 'correo', problema: 'Correo repetido.' }]);
  }

  return {
    async listarProductores(peticion) {
      const { pagina, porPagina, limite, desplazamiento } = paginar(peticion.query);
      const filtro = peticion.query.municipio ?? null;
      const { rows } = await pool.query(
        `SELECT ${COL_PRODUCTOR}, count(*) OVER () AS total FROM productor
         WHERE ($1::text IS NULL OR municipio ILIKE $1) ORDER BY nombre_completo LIMIT $2 OFFSET $3`,
        [filtro, limite, desplazamiento]);
      const total = rows[0]?.total ?? 0;
      rows.forEach((r) => delete r.total);
      return { datos: rows, pagina, por_pagina: porPagina, total };
    },

    async crearProductor(peticion, respuesta) {
      const { nombre_completo, municipio, telefono = null, correo = null } = peticion.body;
      await correoLibre(correo);
      const { rows } = await pool.query(
        `INSERT INTO productor (nombre_completo, municipio, telefono, correo) VALUES ($1,$2,$3,$4) RETURNING ${COL_PRODUCTOR}`,
        [nombre_completo, municipio, telefono, correo]);
      respuesta.code(201).header('Location', `/api/v1/productores/${rows[0].id}`);
      return rows[0];
    },

    async obtenerProductor(peticion) {
      const productor = await buscar(peticion.params.productor_id);
      exigirDueno(peticion.user, productor.id, 'este productor');
      return productor;
    },

    async actualizarProductor(peticion) {
      const productor = await buscar(peticion.params.productor_id);
      exigirDueno(peticion.user, productor.id, 'este productor');
      if ('correo' in peticion.body) await correoLibre(peticion.body.correo, productor.id);
      return actualizarFila(pool, 'productor', productor.id, peticion.body, EDITABLES, COL_PRODUCTOR);
    },

    async eliminarProductor(peticion, respuesta) {
      const productor = await buscar(peticion.params.productor_id);
      const { rows } = await pool.query(
        `SELECT (SELECT count(*) FROM lote WHERE productor_id = $1) AS lotes,
                (SELECT count(*) FROM usuario WHERE productor_id = $1) AS cuentas`, [productor.id]);
      if (rows[0].lotes > 0) throw conflicto(`El productor tiene ${rows[0].lotes} lotes registrados. Elimínelos primero.`);
      if (rows[0].cuentas > 0) throw conflicto('El productor tiene una cuenta de usuario activa.');
      await pool.query('DELETE FROM productor WHERE id = $1', [productor.id]);
      return respuesta.code(204).send();
    },
  };
};
