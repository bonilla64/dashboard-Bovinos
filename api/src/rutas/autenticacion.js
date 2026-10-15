import { enTransaccion } from '../bd.js';
import { COL_USUARIO } from '../consultas.js';
import { cifrarContrasena, verificarContrasena, HASH_SENUELO } from '../auth.js';
import { conflicto, noAutenticado } from '../errores.js';

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

  return {
    async registrarUsuario(peticion, respuesta) {
      const { nombre_completo, correo, contrasena, municipio, telefono = null } = peticion.body;
      const existe = await pool.query('SELECT 1 FROM usuario WHERE lower(correo) = lower($1)', [correo]);
      if (existe.rowCount) throw conflicto('Ya existe una cuenta con ese correo.', [{ campo: 'correo', problema: 'Correo ya registrado.' }]);
      const hash = await cifrarContrasena(contrasena, config.costoBcrypt);
      const usuario = await enTransaccion(pool, async (bd) => {
        const p = await bd.query(
          'INSERT INTO productor (nombre_completo, municipio, telefono, correo) VALUES ($1,$2,$3,$4) RETURNING id',
          [nombre_completo, municipio, telefono, correo]);
        const u = await bd.query(
          `INSERT INTO usuario (nombre_completo, correo, contrasena_hash, rol, productor_id)
           VALUES ($1,$2,$3,'productor',$4) RETURNING ${COL_USUARIO}`,
          [nombre_completo, correo, hash, p.rows[0].id]);
        return u.rows[0];
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
      delete fila.contrasena_hash;
      return sesionPara(fila);
    },

    async obtenerUsuarioActual(peticion) {
      const { rows } = await pool.query(`SELECT ${COL_USUARIO} FROM usuario WHERE id = $1`, [peticion.user.sub]);
      if (!rows[0]) throw noAutenticado('La cuenta de esta sesión ya no existe.');
      return rows[0];
    },
  };
};
