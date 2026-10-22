import { enTransaccion } from '../bd.js';
import { COL_USUARIO, COL_USUARIO_DETALLE } from '../consultas.js';
import { cifrarContrasena, verificarContrasena, HASH_SENUELO } from '../auth.js';
import { anotar, camposCambiados } from '../bitacora.js';
import { exigirCorreoLibre, guardarFicha, insertarFicha, prepararFicha, buscarProductor } from '../fichas.js';
import { conflicto, noAutenticado, prohibido, validacion } from '../errores.js';

const CAMPOS_FICHA = ['nombre_completo', 'correo', 'telefono', 'municipio', 'vereda', 'tipo_persona', 'tipo_documento',
  'numero_documento', 'representante_legal'];

export async function usuarioDetalle(bd, id) {
  const { rows } = await bd.query(`SELECT ${COL_USUARIO_DETALLE} FROM usuario u WHERE u.id = $1`, [id]);
  return rows[0] || null;
}

/** Administradores activos distintos de `excepto`; sirve para no dejar nunca el sistema sin administrador. */
export async function otrosAdministradores(bd, excepto) {
  const { rows } = await bd.query(
    "SELECT count(*) AS n FROM usuario WHERE rol = 'administrador' AND activo AND id <> $1", [excepto]);
  return rows[0].n;
}

const contrasenaIncorrecta = (campo) => validacion('La contraseña no es correcta.', [{ campo, problema: 'Contraseña incorrecta.' }]);

export default ({ pool, config, app }) => {
  const sesionPara = (usuario) => ({
    token: app.jwt.sign(
      { sub: usuario.id, rol: usuario.rol, productor_id: usuario.productor_id },
      { expiresIn: config.jwtExpiraSegundos },
    ),
    tipo: 'Bearer',
    expira_en: config.jwtExpiraSegundos,
    usuario,
  });

  async function hashDe(id) {
    const { rows } = await pool.query('SELECT contrasena_hash FROM usuario WHERE id = $1', [id]);
    return rows[0]?.contrasena_hash ?? HASH_SENUELO;
  }

  return {
    async registrarUsuario(peticion, respuesta) {
      const b = peticion.body;
      const hash = await cifrarContrasena(b.contrasena, config.costoBcrypt);
      const usuario = await enTransaccion(pool, async (bd) => {
        await exigirCorreoLibre(bd, b.correo);
        const datos = Object.fromEntries(CAMPOS_FICHA.filter((k) => k in b).map((k) => [k, b[k]]));
        const ficha = await insertarFicha(bd, await prepararFicha(bd, null, datos), { aceptaDatos: true });
        const { rows: [u] } = await bd.query(
          `INSERT INTO usuario (nombre_completo, correo, contrasena_hash, rol, productor_id, ultimo_ingreso)
           VALUES ($1,$2,$3,'productor',$4, now()) RETURNING ${COL_USUARIO}`,
          [ficha.nombre_completo, b.correo, hash, ficha.id]);
        await anotar(bd, { sub: u.id, nombre: u.nombre_completo }, 'registrar', 'usuario', u.id,
          { tipo_persona: ficha.tipo_persona, municipio: ficha.municipio });
        return u;
      });
      respuesta.code(201);
      return sesionPara(usuario);
    },

    async iniciarSesion(peticion) {
      const { correo, contrasena } = peticion.body;
      const { rows } = await pool.query(
        `SELECT ${COL_USUARIO}, contrasena_hash FROM usuario WHERE lower(correo) = lower($1)`, [correo]);
      const fila = rows[0];
      // Se compara siempre, aunque el correo no exista, para no revelar qué correos están registrados.
      const valida = await verificarContrasena(contrasena, fila?.contrasena_hash || HASH_SENUELO);
      if (!fila || !valida) throw noAutenticado('Correo o contraseña incorrectos.');
      if (!fila.activo) throw prohibido('Su cuenta está suspendida. Comuníquese con el administrador.');
      const { rows: [u] } = await pool.query(
        `UPDATE usuario SET ultimo_ingreso = now() WHERE id = $1 RETURNING ${COL_USUARIO}`, [fila.id]);
      return sesionPara(u);
    },

    async obtenerUsuarioActual(peticion) {
      const u = await usuarioDetalle(pool, peticion.user.sub);
      if (!u) throw noAutenticado('La cuenta de esta sesión ya no existe.');
      return u;
    },

    async actualizarPerfil(peticion) {
      const yo = peticion.user;
      const b = peticion.body;
      await enTransaccion(pool, async (bd) => {
        if (yo.productor_id) {
          const actual = await buscarProductor(bd, yo.productor_id);
          const sets = await prepararFicha(bd, actual, b, { conCuenta: true });
          await guardarFicha(bd, actual.id, sets);
        } else {
          // Administrador sin ficha: solo tiene nombre y correo.
          const ajenos = Object.keys(b).filter((k) => !['nombre_completo', 'correo'].includes(k));
          if (ajenos.length) {
            throw validacion('Esta cuenta no tiene ficha de productor; solo puede cambiar nombre y correo.',
              ajenos.map((campo) => ({ campo, problema: 'No aplica a esta cuenta.' })));
          }
          if (b.correo) await exigirCorreoLibre(bd, b.correo, { usuarioId: yo.sub });
          await bd.query('UPDATE usuario SET nombre_completo = COALESCE($1, nombre_completo), correo = COALESCE($2, correo) WHERE id = $3',
            [b.nombre_completo ?? null, b.correo ?? null, yo.sub]);
        }
        await anotar(bd, yo, 'actualizar', 'perfil', yo.sub, { campos: camposCambiados(b) });
      });
      return usuarioDetalle(pool, yo.sub);
    },

    async cambiarContrasena(peticion, respuesta) {
      const { contrasena_actual: actual, contrasena_nueva: nueva } = peticion.body;
      if (!(await verificarContrasena(actual, await hashDe(peticion.user.sub)))) throw contrasenaIncorrecta('contrasena_actual');
      if (actual === nueva) {
        throw validacion('La contraseña nueva debe ser distinta de la actual.', [{ campo: 'contrasena_nueva', problema: 'Igual a la actual.' }]);
      }
      const hash = await cifrarContrasena(nueva, config.costoBcrypt);
      await pool.query('UPDATE usuario SET contrasena_hash = $1, debe_cambiar_contrasena = false WHERE id = $2', [hash, peticion.user.sub]);
      await anotar(pool, peticion.user, 'cambiar_contrasena', 'usuario', peticion.user.sub);
      return respuesta.code(204).send();
    },

    async eliminarCuenta(peticion, respuesta) {
      const yo = peticion.user;
      if (!(await verificarContrasena(peticion.body.contrasena, await hashDe(yo.sub)))) throw contrasenaIncorrecta('contrasena');
      await enTransaccion(pool, async (bd) => {
        if (yo.rol === 'administrador' && (await otrosAdministradores(bd, yo.sub)) === 0) {
          throw conflicto('Es el único administrador activo. Nombre a otro administrador antes de eliminar su cuenta.');
        }
        let accion = 'eliminar';
        if (yo.productor_id) {
          const { rows: [{ n }] } = await bd.query('SELECT count(*) AS n FROM lote WHERE productor_id = $1', [yo.productor_id]);
          await bd.query('DELETE FROM usuario WHERE id = $1', [yo.sub]);
          if (n > 0) {
            // Los lotes y simulaciones se conservan (son historia del mercado), pero sin datos personales.
            accion = 'anonimizar';
            await bd.query(
              `UPDATE productor SET nombre_completo = 'Productor retirado', correo = NULL, telefono = NULL,
                 tipo_documento = NULL, numero_documento = NULL, representante_legal = NULL, vereda = NULL,
                 tipo_persona = 'natural', documento_verificado = false
               WHERE id = $1`, [yo.productor_id]);
            await bd.query("UPDATE finca SET vereda = NULL, ubicacion = NULL WHERE productor_id = $1", [yo.productor_id]);
          } else {
            await bd.query('DELETE FROM productor WHERE id = $1', [yo.productor_id]);
          }
        } else {
          await bd.query('DELETE FROM usuario WHERE id = $1', [yo.sub]);
        }
        await bd.query("UPDATE bitacora SET usuario_nombre = 'Cuenta eliminada' WHERE usuario_id = $1", [yo.sub]);
        await anotar(bd, null, accion, 'cuenta', yo.sub, { por: 'el titular', rol: yo.rol });
      });
      return respuesta.code(204).send();
    },
  };
};
