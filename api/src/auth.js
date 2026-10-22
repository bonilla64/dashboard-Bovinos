// Autenticación (JWT + bcrypt) y autorización (por rol y por dueño del recurso).
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { noAutenticado, prohibido } from './errores.js';

export const cifrarContrasena = (texto, costo) => bcrypt.hash(texto, costo);
export const verificarContrasena = (texto, hash) => bcrypt.compare(texto, hash);

// Hash fijo para comparar cuando el correo no existe: así la respuesta tarda lo mismo
// y no se puede averiguar qué correos están registrados midiendo el tiempo.
export const HASH_SENUELO = '$2b$12$MTzVC/CheIkURCy9r9YlX.ULElz4/DuVSDs0IkW8wMe4SfHKqUuHq';

// Operaciones que puede usar una cuenta con contraseña temporal (para poder cambiarla).
const PERMITIDAS_CON_TEMPORAL = new Set(['obtenerUsuarioActual', 'cambiarContrasena']);

/**
 * preHandler que exige un token válido y, si se indican, alguno de los roles.
 * El token solo prueba quién es: el estado de la cuenta (activa, rol, contraseña temporal) se lee de la base
 * en cada petición, así una suspensión o un cambio de rol se aplican de inmediato aunque el token siga vigente.
 */
export function exigirSesion(pool, roles, operationId) {
  return async function (peticion) {
    try {
      await peticion.jwtVerify();
    } catch {
      throw noAutenticado(peticion.headers.authorization
        ? 'La sesión venció o el token no es válido. Inicie sesión de nuevo.'
        : 'Debe iniciar sesión para usar esta operación.');
    }
    const { rows: [cuenta] } = await pool.query(
      'SELECT id, nombre_completo, rol, productor_id, activo, debe_cambiar_contrasena FROM usuario WHERE id = $1',
      [peticion.user.sub]);
    if (!cuenta) throw noAutenticado('La cuenta de esta sesión ya no existe.');
    if (!cuenta.activo) throw noAutenticado('Su cuenta está suspendida. Comuníquese con el administrador.');
    peticion.user = { sub: cuenta.id, nombre: cuenta.nombre_completo, rol: cuenta.rol, productor_id: cuenta.productor_id };
    if (cuenta.debe_cambiar_contrasena && !PERMITIDAS_CON_TEMPORAL.has(operationId)) {
      throw prohibido('Debe cambiar la contraseña temporal antes de continuar (Mi cuenta → Cambiar contraseña).');
    }
    if (roles && !roles.includes(cuenta.rol)) {
      throw prohibido('Su rol no permite esta operación.');
    }
  };
}

export const esAdmin = (usuario) => usuario?.rol === 'administrador';

/** Lanza 403 si el usuario no es administrador ni dueño del productor indicado. */
export function exigirDueno(usuario, productorId, recurso = 'este recurso') {
  if (esAdmin(usuario)) return;
  if (!usuario?.productor_id || usuario.productor_id !== productorId) {
    throw prohibido(`No tiene permiso sobre ${recurso}.`);
  }
}

// Sin letras ni números que se confundan al dictarlos (0/O, 1/l/I).
const ALFABETO = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Contraseña temporal legible de 12 caracteres en tres grupos, p. ej. «k7Rm-q2Xa-9Fhd». */
export function generarContrasenaTemporal() {
  const grupo = () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
  return `${grupo()}-${grupo()}-${grupo()}`;
}
