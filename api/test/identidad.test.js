// Reglas de identidad (sin base de datos): dígito de verificación del NIT, documentos y coherencia persona/empresa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digitoVerificacion, validarDocumento, revisarIdentidad, distanciaACabecera, MUNICIPIOS_CASANARE } from '../src/identidad.js';
import { generarContrasenaTemporal } from '../src/auth.js';

test('dígito de verificación del NIT (DIAN)', () => {
  assert.equal(digitoVerificacion('800197268'), 4); // DIAN
  assert.equal(digitoVerificacion('900845216'), 5);
  assert.equal(digitoVerificacion('899999068'), 1);
});

test('el NIT se normaliza con guion y se rechaza si el dígito no corresponde', () => {
  assert.deepEqual(validarDocumento('NIT', '900.845.216-5'), { valor: '900845216-5' });
  assert.deepEqual(validarDocumento('NIT', '9008452165'), { valor: '900845216-5' });
  assert.match(validarDocumento('NIT', '900845216-3').problema, /debe ser 5/);
  assert.ok(validarDocumento('NIT', '12345').problema);
});

test('cédulas: CC de 5 a 10 dígitos, CE de 6 a 10, sin puntos', () => {
  assert.deepEqual(validarDocumento('CC', '74.852.369'), { valor: '74852369' });
  assert.ok(validarDocumento('CC', '1234').problema);
  assert.ok(validarDocumento('CC', '12345678901').problema);
  assert.ok(validarDocumento('CE', '12345').problema);
  assert.ok(validarDocumento('CC', '12a456').problema);
});

test('una empresa usa NIT y representante legal; una persona, cédula', () => {
  const empresa = revisarIdentidad({ tipo_persona: 'juridica', tipo_documento: 'CC', numero_documento: '74852369' });
  assert.deepEqual(empresa.problemas.map((p) => p.campo).sort(), ['representante_legal', 'tipo_documento']);
  const persona = revisarIdentidad({ tipo_persona: 'natural', tipo_documento: 'NIT', numero_documento: '900845216-5' });
  assert.deepEqual(persona.problemas.map((p) => p.campo), ['tipo_documento']);
  const bien = revisarIdentidad({ tipo_persona: 'juridica', tipo_documento: 'NIT', numero_documento: '9008452165', representante_legal: 'Camilo Pérez' });
  assert.deepEqual(bien.problemas, []);
  assert.equal(bien.salida.numero_documento, '900845216-5');
});

test('los 19 municipios de Casanare y la distancia a su cabecera', () => {
  assert.equal(MUNICIPIOS_CASANARE.length, 19);
  assert.ok(distanciaACabecera('Yopal', { type: 'Point', coordinates: [-72.40, 5.34] }) < 5);
  assert.ok(distanciaACabecera('Yopal', { type: 'Point', coordinates: [-75.57, 6.25] }) > 300); // Medellín
  assert.equal(distanciaACabecera('Sogamoso', { type: 'Point', coordinates: [-72.9, 5.7] }), null);
});

test('la contraseña temporal es legible y cambia cada vez', () => {
  const a = generarContrasenaTemporal();
  assert.match(a, /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
  assert.ok(!/[0O1lI]/.test(a));
  assert.notEqual(a, generarContrasenaTemporal());
});
