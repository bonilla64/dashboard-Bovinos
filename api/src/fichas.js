// Reglas compartidas de la ficha del productor: las usan el registro, «Mi cuenta», la administración de
// usuarios y el recurso /productores, para que una persona o empresa quede igual de validada por cualquier camino.
import { COL_PRODUCTOR } from './consultas.js';
import { revisarIdentidad } from './identidad.js';
import { conflicto, noEncontrado, prohibido, validacion } from './errores.js';

const IDENTIDAD = ['tipo_persona', 'tipo_documento', 'numero_documento', 'representante_legal'];
const COLUMNAS = ['tipo_persona', 'tipo_documento', 'numero_documento', 'representante_legal', 'nombre_completo',
  'municipio', 'vereda', 'telefono', 'correo', 'documento_verificado'];

export async function buscarProductor(bd, id) {
  const { rows } = await bd.query(`SELECT ${COL_PRODUCTOR} FROM productor WHERE id = $1`, [id]);
  if (!rows[0]) throw noEncontrado('No existe ese productor.');
  return rows[0];
}

/** El correo no puede estar en otra cuenta ni en otra ficha (salvo las del mismo productor). */
export async function exigirCorreoLibre(bd, correo, { productorId = null, usuarioId = null } = {}) {
  if (!correo) return;
  const { rows } = await bd.query(
    `SELECT (SELECT count(*) FROM usuario WHERE lower(correo) = lower($1) AND id IS DISTINCT FROM $2
               AND productor_id IS DISTINCT FROM $3) AS cuentas,
            (SELECT count(*) FROM productor WHERE lower(correo) = lower($1) AND id IS DISTINCT FROM $3) AS fichas`,
    [correo, usuarioId, productorId]);
  if (rows[0].cuentas > 0 || rows[0].fichas > 0) {
    throw conflicto('Ya existe una cuenta con ese correo.', [{ campo: 'correo', problema: 'Correo ya registrado.' }]);
  }
}

async function exigirDocumentoLibre(bd, tipo, numero, excepto = null) {
  if (!numero) return;
  const { rowCount } = await bd.query(
    'SELECT 1 FROM productor WHERE tipo_documento = $1 AND numero_documento = $2 AND id IS DISTINCT FROM $3',
    [tipo, numero, excepto]);
  if (rowCount) {
    throw conflicto(`Ya hay un productor registrado con ${tipo} ${numero}.`,
      [{ campo: 'numero_documento', problema: 'Documento ya registrado.' }]);
  }
}

/**
 * Revisa los cambios de una ficha (o una ficha nueva si `actual` es null) y devuelve los valores a guardar.
 * - Coherencia persona/empresa ↔ CC, CE o NIT, dígito de verificación y representante legal.
 * - Un documento ya verificado solo lo puede cambiar un administrador; si cambia, deja de estar verificado.
 * - Documento y correo únicos.
 */
export async function prepararFicha(bd, actual, cambios, { admin = false, conCuenta = false } = {}) {
  const c = { ...cambios };
  if ('documento_verificado' in c && !admin) throw prohibido('Solo un administrador puede verificar documentos.');
  const tocaIdentidad = IDENTIDAD.some((k) => k in c);
  const docCambia = ['tipo_persona', 'tipo_documento', 'numero_documento'].some((k) => k in c && c[k] !== actual?.[k]);

  if (actual?.documento_verificado && docCambia && !admin) {
    throw conflicto('El documento ya fue verificado por el administrador; para corregirlo comuníquese con él.',
      [{ campo: 'numero_documento', problema: 'Documento verificado: no se puede cambiar.' }]);
  }
  const final = { ...(actual || {}), ...c };
  if (final.tipo_persona === 'natural') {
    if (final.representante_legal != null) c.representante_legal = null;
    final.representante_legal = null;
  }
  if (!actual || tocaIdentidad) {
    const { problemas, salida } = revisarIdentidad(final);
    if (final.tipo_documento && final.numero_documento == null) {
      problemas.push({ campo: 'numero_documento', problema: 'Falta el número de documento.' });
    }
    if (!final.tipo_documento && final.numero_documento) {
      problemas.push({ campo: 'tipo_documento', problema: 'Falta el tipo de documento.' });
    }
    if (problemas.length) throw validacion('Los datos de identificación no son coherentes.', problemas);
    if (salida.numero_documento) { c.numero_documento = salida.numero_documento; final.numero_documento = salida.numero_documento; }
    if (typeof c.representante_legal === 'string') c.representante_legal = c.representante_legal.trim();
  }
  if (actual && docCambia && !('documento_verificado' in c)) c.documento_verificado = false;
  if (c.documento_verificado && !final.numero_documento) {
    throw validacion('No se puede verificar una ficha sin documento.', [{ campo: 'documento_verificado', problema: 'La ficha no tiene documento.' }]);
  }
  if (conCuenta && 'correo' in c && !c.correo) {
    throw validacion('Este productor tiene una cuenta: el correo es obligatorio.', [{ campo: 'correo', problema: 'Falta el campo.' }]);
  }
  if (docCambia || !actual) await exigirDocumentoLibre(bd, final.tipo_documento, final.numero_documento, actual?.id ?? null);
  if ('correo' in c && c.correo && c.correo.toLowerCase() !== String(actual?.correo ?? '').toLowerCase()) {
    await exigirCorreoLibre(bd, c.correo, { productorId: actual?.id ?? null });
  }
  return Object.fromEntries(Object.entries(c).filter(([k]) => COLUMNAS.includes(k)));
}

/** Inserta una ficha ya preparada. */
export async function insertarFicha(bd, f, { aceptaDatos = false } = {}) {
  const { rows } = await bd.query(
    `INSERT INTO productor (tipo_persona, tipo_documento, numero_documento, representante_legal, nombre_completo,
       municipio, vereda, telefono, correo, acepta_datos_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $10 THEN now() END) RETURNING ${COL_PRODUCTOR}`,
    [f.tipo_persona, f.tipo_documento ?? null, f.numero_documento ?? null, f.representante_legal ?? null, f.nombre_completo,
      f.municipio, f.vereda ?? null, f.telefono ?? null, f.correo ?? null, aceptaDatos]);
  return rows[0];
}

/** Guarda los cambios y mantiene sincronizados nombre y correo con la cuenta del productor, si la tiene. */
export async function guardarFicha(bd, id, sets) {
  const claves = Object.keys(sets);
  let fila;
  if (claves.length) {
    const valores = claves.map((k) => sets[k]);
    const { rows } = await bd.query(
      `UPDATE productor SET ${claves.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${claves.length + 1}
       RETURNING ${COL_PRODUCTOR}`, [...valores, id]);
    fila = rows[0];
  } else {
    fila = await buscarProductor(bd, id);
  }
  if ('nombre_completo' in sets || ('correo' in sets && sets.correo)) {
    await bd.query(
      `UPDATE usuario SET nombre_completo = $1, correo = COALESCE($2, correo) WHERE productor_id = $3`,
      [fila.nombre_completo, sets.correo ?? null, id]);
  }
  return fila;
}
