// Bitácora: deja constancia de quién cambió qué (acciones de administración, registros y cuentas eliminadas).
// Se escribe dentro de la misma transacción del cambio cuando la hay, para que nunca quede un cambio sin registro.

/**
 * @param bd       pool o cliente de una transacción
 * @param usuario  peticion.user ({ sub, nombre }) o null si lo hace el sistema
 */
export async function anotar(bd, usuario, accion, recurso, recursoId = null, detalle = {}) {
  await bd.query(
    `INSERT INTO bitacora (usuario_id, usuario_nombre, accion, recurso, recurso_id, detalle)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [usuario?.sub ?? null, usuario?.nombre ?? null, accion, recurso, recursoId ? String(recursoId) : null, JSON.stringify(detalle)]);
}

/** Lista de campos que llegaron en un PATCH, sin valores sensibles, para el detalle de la bitácora. */
export const camposCambiados = (cuerpo) => Object.keys(cuerpo).filter((c) => !c.startsWith('contrasena'));
