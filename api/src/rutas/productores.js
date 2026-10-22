import { enTransaccion } from '../bd.js';
import { COL_PRODUCTOR, paginar } from '../consultas.js';
import { esAdmin, exigirDueno } from '../auth.js';
import { anotar, camposCambiados } from '../bitacora.js';
import { buscarProductor, guardarFicha, insertarFicha, prepararFicha } from '../fichas.js';
import { conflicto } from '../errores.js';

export default ({ pool }) => ({
  async listarProductores(peticion) {
    const q = peticion.query;
    const { pagina, porPagina, limite, desplazamiento } = paginar(q);
    const texto = q.q ? `%${q.q.trim()}%` : null;
    const { rows } = await pool.query(
      `SELECT ${COL_PRODUCTOR}, count(*) OVER () AS total FROM productor
       WHERE ($1::text IS NULL OR municipio ILIKE $1)
         AND ($2::text IS NULL OR nombre_completo ILIKE $2 OR numero_documento ILIKE $2)
         AND ($3::tipo_persona IS NULL OR tipo_persona = $3)
         AND ($4::boolean IS NULL OR documento_verificado = $4)
       ORDER BY nombre_completo LIMIT $5 OFFSET $6`,
      [q.municipio ?? null, texto, q.tipo_persona ?? null, q.verificado ?? null, limite, desplazamiento]);
    const total = rows[0]?.total ?? 0;
    rows.forEach((r) => delete r.total);
    return { datos: rows, pagina, por_pagina: porPagina, total };
  },

  async crearProductor(peticion, respuesta) {
    const fila = await enTransaccion(pool, async (bd) => {
      const f = await insertarFicha(bd, await prepararFicha(bd, null, peticion.body, { admin: true }));
      await anotar(bd, peticion.user, 'crear', 'productor', f.id, { nombre: f.nombre_completo });
      return f;
    });
    respuesta.code(201).header('Location', `/api/v1/productores/${fila.id}`);
    return fila;
  },

  async obtenerProductor(peticion) {
    const productor = await buscarProductor(pool, peticion.params.productor_id);
    exigirDueno(peticion.user, productor.id, 'este productor');
    return productor;
  },

  async actualizarProductor(peticion) {
    const admin = esAdmin(peticion.user);
    return enTransaccion(pool, async (bd) => {
      const actual = await buscarProductor(bd, peticion.params.productor_id);
      exigirDueno(peticion.user, actual.id, 'este productor');
      const { rowCount: conCuenta } = await bd.query('SELECT 1 FROM usuario WHERE productor_id = $1', [actual.id]);
      const sets = await prepararFicha(bd, actual, peticion.body, { admin, conCuenta: conCuenta > 0 });
      const fila = await guardarFicha(bd, actual.id, sets);
      if (admin) {
        const b = peticion.body;
        if ('documento_verificado' in b && b.documento_verificado !== actual.documento_verificado) {
          await anotar(bd, peticion.user, b.documento_verificado ? 'verificar_documento' : 'quitar_verificacion', 'productor', actual.id,
            { documento: `${fila.tipo_documento ?? ''} ${fila.numero_documento ?? ''}`.trim() });
        }
        const otros = camposCambiados(b).filter((c) => c !== 'documento_verificado');
        if (otros.length) await anotar(bd, peticion.user, 'actualizar', 'productor', actual.id, { campos: otros });
      }
      return fila;
    });
  },

  async eliminarProductor(peticion, respuesta) {
    const productor = await buscarProductor(pool, peticion.params.productor_id);
    const { rows } = await pool.query(
      `SELECT (SELECT count(*) FROM lote WHERE productor_id = $1) AS lotes,
              (SELECT count(*) FROM usuario WHERE productor_id = $1) AS cuentas`, [productor.id]);
    if (rows[0].lotes > 0) throw conflicto(`El productor tiene ${rows[0].lotes} lotes registrados. Elimínelos primero.`);
    if (rows[0].cuentas > 0) throw conflicto('El productor tiene una cuenta de usuario. Adminístrela desde Usuarios.');
    await pool.query('DELETE FROM productor WHERE id = $1', [productor.id]);
    await anotar(pool, peticion.user, 'eliminar', 'productor', productor.id, { nombre: productor.nombre_completo });
    return respuesta.code(204).send();
  },
});
