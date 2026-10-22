// Administración de cuentas (solo administradores). Reglas de integridad:
// - Nunca queda el sistema sin un administrador activo, y nadie se quita a sí mismo el rol ni se suspende.
// - Una cuenta con lotes no se borra: se suspende (sus lotes y simulaciones son historia del mercado).
// - Las cuentas que crea el administrador nacen con contraseña temporal y deben cambiarla al ingresar.
import { enTransaccion } from '../bd.js';
import { COL_USUARIO_DETALLE, paginar } from '../consultas.js';
import { cifrarContrasena, generarContrasenaTemporal } from '../auth.js';
import { anotar } from '../bitacora.js';
import { exigirCorreoLibre, insertarFicha, prepararFicha } from '../fichas.js';
import { conflicto, noEncontrado, validacion } from '../errores.js';
import { otrosAdministradores, usuarioDetalle } from './autenticacion.js';

const CAMPOS_FICHA = ['nombre_completo', 'correo', 'telefono', 'municipio', 'vereda', 'tipo_persona', 'tipo_documento',
  'numero_documento', 'representante_legal'];

export default ({ pool, config }) => {
  async function buscar(bd, id) {
    const u = await usuarioDetalle(bd, id);
    if (!u) throw noEncontrado('No existe esa cuenta.');
    return u;
  }

  return {
    async listarUsuarios(peticion) {
      const q = peticion.query;
      const { pagina, porPagina, limite, desplazamiento } = paginar(q);
      const texto = q.q ? `%${q.q.trim()}%` : null;
      const { rows } = await pool.query(
        `SELECT ${COL_USUARIO_DETALLE}, count(*) OVER () AS total
         FROM usuario u LEFT JOIN productor pr ON pr.id = u.productor_id
         WHERE ($1::text IS NULL OR u.nombre_completo ILIKE $1 OR u.correo ILIKE $1 OR pr.numero_documento ILIKE $1)
           AND ($2::rol_usuario IS NULL OR u.rol = $2)
           AND ($3::boolean IS NULL OR u.activo = $3)
         ORDER BY u.rol, u.nombre_completo LIMIT $4 OFFSET $5`,
        [texto, q.rol ?? null, q.activo ?? null, limite, desplazamiento]);
      const total = rows[0]?.total ?? 0;
      rows.forEach((r) => delete r.total);
      return { datos: rows, pagina, por_pagina: porPagina, total };
    },

    async crearUsuario(peticion, respuesta) {
      const b = peticion.body;
      const hash = await cifrarContrasena(b.contrasena, config.costoBcrypt);
      const id = await enTransaccion(pool, async (bd) => {
        await exigirCorreoLibre(bd, b.correo);
        let productorId = null;
        if (b.rol === 'productor') {
          const faltan = ['tipo_persona', 'tipo_documento', 'numero_documento', 'municipio'].filter((k) => b[k] === undefined);
          if (faltan.length) {
            throw validacion('Para una cuenta de productor faltan los datos de la ficha.', faltan.map((campo) => ({ campo, problema: 'Falta el campo.' })));
          }
          const datos = Object.fromEntries(CAMPOS_FICHA.filter((k) => k in b).map((k) => [k, b[k]]));
          productorId = (await insertarFicha(bd, await prepararFicha(bd, null, datos, { admin: true }))).id;
        }
        const { rows: [u] } = await bd.query(
          `INSERT INTO usuario (nombre_completo, correo, contrasena_hash, rol, productor_id, debe_cambiar_contrasena)
           VALUES ($1,$2,$3,$4,$5, true) RETURNING id`,
          [b.nombre_completo, b.correo, hash, b.rol, productorId]);
        await anotar(bd, peticion.user, 'crear', 'usuario', u.id, { rol: b.rol, correo: b.correo });
        return u.id;
      });
      respuesta.code(201).header('Location', `/api/v1/usuarios/${id}`);
      return usuarioDetalle(pool, id);
    },

    async obtenerUsuario(peticion) {
      return buscar(pool, peticion.params.usuario_id);
    },

    async actualizarUsuario(peticion) {
      const b = peticion.body;
      const yo = peticion.user;
      await enTransaccion(pool, async (bd) => {
        const u = await buscar(bd, peticion.params.usuario_id);
        const propia = u.id === yo.sub;
        const pierdeAdmin = u.rol === 'administrador' && u.activo && ((b.rol && b.rol !== 'administrador') || b.activo === false);
        if (propia && b.rol && b.rol !== u.rol) throw conflicto('No puede cambiar el rol de su propia cuenta.', [{ campo: 'rol', problema: 'Cuenta propia.' }]);
        if (propia && b.activo === false) throw conflicto('No puede suspender su propia cuenta.', [{ campo: 'activo', problema: 'Cuenta propia.' }]);
        if (pierdeAdmin && (await otrosAdministradores(bd, u.id)) === 0) {
          throw conflicto('Es el único administrador activo: el sistema no puede quedar sin administrador.');
        }
        if (b.rol === 'productor' && !u.productor_id) {
          throw validacion('Esta cuenta no tiene ficha de productor; cree una cuenta de productor en su lugar.', [{ campo: 'rol', problema: 'Sin ficha de productor.' }]);
        }
        if (b.correo && b.correo.toLowerCase() !== u.correo.toLowerCase()) {
          await exigirCorreoLibre(bd, b.correo, { usuarioId: u.id, productorId: u.productor_id });
        }
        const sets = [];
        const valores = [];
        for (const campo of ['nombre_completo', 'correo', 'rol', 'activo']) {
          if (!(campo in b)) continue;
          valores.push(b[campo]);
          sets.push(`${campo} = $${valores.length}`);
        }
        valores.push(u.id);
        await bd.query(`UPDATE usuario SET ${sets.join(', ')} WHERE id = $${valores.length}`, valores);
        // Nombre y correo son los mismos en la cuenta y en la ficha.
        if (u.productor_id && (b.nombre_completo || b.correo)) {
          await bd.query('UPDATE productor SET nombre_completo = COALESCE($1, nombre_completo), correo = COALESCE($2, correo) WHERE id = $3',
            [b.nombre_completo ?? null, b.correo ?? null, u.productor_id]);
        }
        if (b.rol && b.rol !== u.rol) await anotar(bd, yo, 'cambiar_rol', 'usuario', u.id, { de: u.rol, a: b.rol });
        if ('activo' in b && b.activo !== u.activo) await anotar(bd, yo, b.activo ? 'reactivar' : 'suspender', 'usuario', u.id, { correo: u.correo });
        const otros = ['nombre_completo', 'correo'].filter((k) => k in b);
        if (otros.length) await anotar(bd, yo, 'actualizar', 'usuario', u.id, { campos: otros });
      });
      return buscar(pool, peticion.params.usuario_id);
    },

    async eliminarUsuario(peticion, respuesta) {
      const yo = peticion.user;
      await enTransaccion(pool, async (bd) => {
        const u = await buscar(bd, peticion.params.usuario_id);
        if (u.id === yo.sub) throw conflicto('No puede eliminar su propia cuenta desde aquí; use Mi cuenta.');
        if (u.rol === 'administrador' && u.activo && (await otrosAdministradores(bd, u.id)) === 0) {
          throw conflicto('Es el único administrador activo: el sistema no puede quedar sin administrador.');
        }
        if (u.productor_id) {
          const { rows: [{ n }] } = await bd.query('SELECT count(*) AS n FROM lote WHERE productor_id = $1', [u.productor_id]);
          if (n > 0) {
            throw conflicto(`La cuenta tiene ${n} lotes registrados. Suspéndala (activo = false) en lugar de eliminarla.`,
              [{ campo: 'activo', problema: 'Use la suspensión.' }]);
          }
        }
        await bd.query('DELETE FROM usuario WHERE id = $1', [u.id]);
        if (u.productor_id) await bd.query('DELETE FROM productor WHERE id = $1', [u.productor_id]);
        await anotar(bd, yo, 'eliminar', 'usuario', u.id, { correo: u.correo, rol: u.rol });
      });
      return respuesta.code(204).send();
    },

    async restablecerContrasena(peticion) {
      const u = await buscar(pool, peticion.params.usuario_id);
      if (u.id === peticion.user.sub) throw conflicto('Para su propia cuenta use «Cambiar contraseña» en Mi cuenta.');
      const temporal = generarContrasenaTemporal();
      const hash = await cifrarContrasena(temporal, config.costoBcrypt);
      await pool.query('UPDATE usuario SET contrasena_hash = $1, debe_cambiar_contrasena = true WHERE id = $2', [hash, u.id]);
      await anotar(pool, peticion.user, 'restablecer_contrasena', 'usuario', u.id, { correo: u.correo });
      return { contrasena_temporal: temporal };
    },
  };
};
