// Autenticación (JWT + bcrypt) y autorización (por rol y por dueño del recurso).
import bcrypt from 'bcryptjs';
import { noAutenticado, prohibido } from './errores.js';

export const cifrarContrasena = (texto, costo) => bcrypt.hash(texto, costo);
export const verificarContrasena = (texto, hash) => bcrypt.compare(texto, hash);

// Hash fijo para comparar cuando el correo no existe: así la respuesta tarda lo mismo
// y no se puede averiguar qué correos están registrados midiendo el tiempo.
export const HASH_SENUELO = '$2b$12$MTzVC/CheIkURCy9r9YlX.ULElz4/DuVSDs0IkW8wMe4SfHKqUuHq';

/** preHandler que exige un token válido y, si se indican, alguno de los roles. */
export function exigirSesion(roles) {
  return async function (peticion) {
    try {
      await peticion.jwtVerify();
    } catch {
      throw noAutenticado(peticion.headers.authorization
        ? 'La sesión venció o el token no es válido. Inicie sesión de nuevo.'
        : 'Debe iniciar sesión para usar esta operación.');
    }
    if (roles && !roles.includes(peticion.user.rol)) {
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
