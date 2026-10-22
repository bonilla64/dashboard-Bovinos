// Reglas de identidad de las cuentas: tipo de persona, documento y ubicación.
// Funciones puras (sin base de datos), por eso se prueban solas en test/identidad.test.js.
import { MUNICIPIOS, distanciaLinealKm } from './geo/origenes.js';

export const MUNICIPIOS_CASANARE = Object.keys(MUNICIPIOS);

const PESOS_NIT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Dígito de verificación de un NIT según la DIAN (módulo 11 con pesos primos). */
export function digitoVerificacion(nit) {
  const digitos = String(nit).replace(/\D/g, '').split('').reverse();
  const suma = digitos.reduce((s, d, i) => s + Number(d) * PESOS_NIT[i], 0);
  const resto = suma % 11;
  return resto > 1 ? 11 - resto : resto;
}

/**
 * Normaliza y valida el documento. Devuelve { valor } o { problema } (texto para el usuario).
 * CC: 5 a 10 dígitos. CE: 6 a 10 dígitos. NIT: 9 dígitos más el dígito de verificación, se guarda como 900123456-7.
 */
export function validarDocumento(tipo, numero) {
  const texto = String(numero ?? '').trim().replace(/[.\s]/g, '');
  if (tipo === 'CC') {
    return /^\d{5,10}$/.test(texto) ? { valor: texto } : { problema: 'La cédula debe tener entre 5 y 10 dígitos, sin puntos.' };
  }
  if (tipo === 'CE') {
    return /^\d{6,10}$/.test(texto) ? { valor: texto } : { problema: 'La cédula de extranjería debe tener entre 6 y 10 dígitos.' };
  }
  if (tipo === 'NIT') {
    const m = texto.match(/^(\d{9})-?(\d)$/);
    if (!m) return { problema: 'El NIT debe tener 9 dígitos y el dígito de verificación, por ejemplo 900123456-7.' };
    const dv = digitoVerificacion(m[1]);
    if (dv !== Number(m[2])) return { problema: `El dígito de verificación no corresponde: para ${m[1]} debe ser ${dv}.` };
    return { valor: `${m[1]}-${m[2]}` };
  }
  return { problema: 'Tipo de documento no válido.' };
}

/**
 * Revisa la coherencia entre tipo de persona, documento y representante legal.
 * Devuelve la lista de problemas ({ campo, problema }) y los valores normalizados.
 */
export function revisarIdentidad({ tipo_persona: persona, tipo_documento: tipo, numero_documento: numero, representante_legal: representante }) {
  const problemas = [];
  const salida = {};
  if (persona === 'juridica' && tipo && tipo !== 'NIT') {
    problemas.push({ campo: 'tipo_documento', problema: 'Una empresa se identifica con NIT.' });
  }
  if (persona === 'natural' && tipo === 'NIT') {
    problemas.push({ campo: 'tipo_documento', problema: 'Una persona se identifica con cédula (CC) o cédula de extranjería (CE).' });
  }
  if (persona === 'juridica' && !String(representante ?? '').trim()) {
    problemas.push({ campo: 'representante_legal', problema: 'Una empresa debe indicar su representante legal.' });
  }
  if (tipo && numero !== undefined) {
    const r = validarDocumento(tipo, numero);
    if (r.problema) problemas.push({ campo: 'numero_documento', problema: r.problema });
    else salida.numero_documento = r.valor;
  }
  return { problemas, salida };
}

/** Distancia de un punto a la cabecera del municipio (km), o null si el municipio no está en la lista. */
export function distanciaACabecera(municipio, punto) {
  const cabecera = MUNICIPIOS[municipio];
  return cabecera && punto ? distanciaLinealKm(cabecera, punto.coordinates) : null;
}

/** Máxima distancia aceptada entre la finca y la cabecera de su municipio (los municipios llaneros son grandes). */
export const MAX_KM_A_CABECERA = 120;
