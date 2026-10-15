// Manejo centralizado de errores: toda falla, venga de donde venga, sale con el esquema Error del contrato.

export class ErrorApi extends Error {
  constructor(estado, codigo, mensaje, detalles = []) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

export const noEncontrado = (mensaje = 'El recurso solicitado no existe.', detalles = []) =>
  new ErrorApi(404, 'NO_ENCONTRADO', mensaje, detalles);
export const prohibido = (mensaje = 'No tiene permiso para esta operación.') => new ErrorApi(403, 'PROHIBIDO', mensaje);
export const noAutenticado = (mensaje = 'Debe iniciar sesión para usar esta operación.') =>
  new ErrorApi(401, 'NO_AUTENTICADO', mensaje);
export const conflicto = (mensaje, detalles = []) => new ErrorApi(409, 'CONFLICTO', mensaje, detalles);
export const validacion = (mensaje, detalles = []) => new ErrorApi(422, 'VALIDACION_FALLIDA', mensaje, detalles);

const NOMBRES_TIPO = { string: 'texto', number: 'número', integer: 'número entero', boolean: 'verdadero o falso', array: 'lista', object: 'objeto', null: 'nulo' };

// Traduce un error de Ajv a una frase en español para el campo `problema`.
function traducir(e) {
  const p = e.params || {};
  switch (e.keyword) {
    case 'required': return 'Falta el campo.';
    case 'minimum': return `Debe ser mayor o igual a ${p.limit}.`;
    case 'maximum': return `Debe ser menor o igual a ${p.limit}.`;
    case 'exclusiveMinimum': return `Debe ser mayor que ${p.limit}.`;
    case 'exclusiveMaximum': return `Debe ser menor que ${p.limit}.`;
    case 'minLength': return `Debe tener al menos ${p.limit} caracteres.`;
    case 'maxLength': return `Debe tener como máximo ${p.limit} caracteres.`;
    case 'minItems': return `Debe tener al menos ${p.limit} elementos.`;
    case 'maxItems': return `Debe tener como máximo ${p.limit} elementos.`;
    case 'uniqueItems': return 'No puede tener elementos repetidos.';
    case 'minProperties': return 'Envíe al menos un campo para modificar.';
    case 'multipleOf': return `Debe ser múltiplo de ${p.multipleOf}.`;
    case 'enum': return `Debe ser uno de: ${(p.allowedValues || []).join(', ')}.`;
    case 'const': return `Debe ser ${p.allowedValue}.`;
    case 'pattern': return 'No tiene el formato esperado.';
    case 'type': return `Debe ser ${String(p.type).split(',').map((t) => NOMBRES_TIPO[t] || t).join(' o ')}.`;
    case 'format':
      return {
        uuid: 'Debe ser un UUID válido.', email: 'Debe ser un correo válido.', date: 'Debe ser una fecha AAAA-MM-DD.',
        'date-time': 'Debe ser fecha y hora ISO 8601.',
      }[p.format] || `No tiene el formato ${p.format}.`;
    default: return e.message || 'Valor no permitido.';
  }
}

function campoDe(e) {
  const ruta = (e.instancePath || '').replace(/^\//, '').split('/').filter(Boolean)
    .map((s, i) => (/^\d+$/.test(s) ? `[${s}]` : (i ? `.${s}` : s))).join('');
  if (e.keyword === 'required') return ruta ? `${ruta}.${e.params.missingProperty}` : e.params.missingProperty;
  return ruta || '(cuerpo)';
}

export function manejadorErrores(error, peticion, respuesta) {
  // 1. Errores propios de la API.
  if (error instanceof ErrorApi) {
    return respuesta.code(error.estado).send({ codigo: error.codigo, mensaje: error.message, detalles: error.detalles });
  }
  // 2. Validación contra el contrato: el cuerpo inválido es 422; parámetros o consulta inválidos son 400.
  if (error.validation) {
    const detalles = error.validation.map((e) => ({ campo: campoDe(e), problema: traducir(e) }));
    if (error.validationContext === 'body') {
      return respuesta.code(422).send({ codigo: 'VALIDACION_FALLIDA', mensaje: 'Hay campos con valores no permitidos.', detalles });
    }
    return respuesta.code(400).send({ codigo: 'PETICION_INVALIDA', mensaje: 'Hay parámetros con formato no válido.', detalles });
  }
  // 3. JSON mal formado o cuerpo vacío.
  if (error.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' || error instanceof SyntaxError) {
    return respuesta.code(400).send({ codigo: 'PETICION_INVALIDA', mensaje: 'El cuerpo no es JSON válido.', detalles: [] });
  }
  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    return respuesta.code(400).send({ codigo: 'PETICION_INVALIDA', mensaje: 'Tipo de contenido no admitido. Use application/json, o text/csv para importar precios.', detalles: [] });
  }
  // 4. Límite de intentos.
  if (error.statusCode === 429) {
    return respuesta.code(429).send({ codigo: 'DEMASIADAS_SOLICITUDES', mensaje: 'Demasiados intentos. Espere un minuto y vuelva a intentar.', detalles: [] });
  }
  // 5. Restricciones de la base de datos que se escaparon de la validación previa.
  if (error.code === '23505') return respuesta.code(409).send({ codigo: 'CONFLICTO', mensaje: 'Ya existe un registro con esos datos.', detalles: [] });
  if (error.code === '23503') return respuesta.code(409).send({ codigo: 'CONFLICTO', mensaje: 'El registro está en uso o hace referencia a otro que no existe.', detalles: [] });
  if (error.code === '23514' || error.code === '22P02') return respuesta.code(422).send({ codigo: 'VALIDACION_FALLIDA', mensaje: 'Algún valor no cumple las reglas de la base de datos.', detalles: [] });
  if (error.code === 'ECONNREFUSED' || error.code === '57P01') {
    return respuesta.code(503).send({ codigo: 'SERVICIO_EXTERNO_NO_DISPONIBLE', mensaje: 'La base de datos no responde.', detalles: [] });
  }
  // 6. Cualquier otra cosa: se registra completo en el log y al cliente no se le filtran detalles internos.
  peticion.log.error({ err: error }, 'Error no controlado');
  return respuesta.code(500).send({ codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado. Intente de nuevo.', detalles: [] });
}

export function manejadorNoEncontrado(peticion, respuesta) {
  respuesta.code(404).send({ codigo: 'NO_ENCONTRADO', mensaje: `No existe la ruta ${peticion.method} ${peticion.url}.`, detalles: [] });
}
