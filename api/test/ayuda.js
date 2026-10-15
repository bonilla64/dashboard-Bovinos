// Utilidades compartidas por las pruebas: base de datos de pruebas, app, sesiones y validación contra el contrato.
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { construirApp, PREFIJO } from '../src/app.js';
import { crearPool } from '../src/bd.js';
import { cargarContrato } from '../src/contrato.js';
import { migrar } from '../scripts/migrar.js';
import { sembrar, CORREO_ADMIN_DEMO } from '../scripts/sembrar.js';

export const URL_PRUEBAS = process.env.DATABASE_URL_PRUEBAS;
export const CONTRASENA = 'contrasena-de-pruebas-123';
export const CORREOS = { admin: CORREO_ADMIN_DEMO, hernando: 'hernando.rincon@correo.co', luz: 'luz.cardenas@correo.co' };
export const IDS = {
  hernando: 'cd3b83ce-114a-5624-bde0-0c482a535db2',
  luz: 'f20f9d5f-85ca-5681-bbf2-6da289276b37',
  loteHernando: '9bad2b17-c8e0-57f7-ac48-2d1cf99ad088',
  loteLevanteHernando: '4c1d9e2f-6a7b-5c8d-9e0f-1a2b3c4d5e6f',
  loteLuz: '7461b160-f980-5d27-af1b-7bd4bb9b14f1',
  finca: '0e6f6c1a-3b0d-5c8e-9f1a-6d2b7c4e8a10',
  yopal: 'acca0ef8-f855-5505-b81b-25833e792ff1',
  guadalupe: '52bbc2f4-901c-5ff0-a08a-5f8f08f91fa1',
  medellin: '15bf935c-dea7-52e8-a312-228463fe5aef',
  rutaVillavicencio: '5ec2ea46-db9d-525b-8417-462de2b24a6a',
};

// Las pruebas borran y vuelven a sembrar la base: nunca pueden apuntar a la base real,
// donde están los precios de Fedegán cargados por el equipo.
if (!URL_PRUEBAS) throw new Error('Defina DATABASE_URL_PRUEBAS (una base aparte, por ejemplo simulador_ganadero_pruebas) para correr las pruebas.');
if (URL_PRUEBAS === process.env.DATABASE_URL) throw new Error('DATABASE_URL_PRUEBAS no puede ser la misma base que DATABASE_URL: las pruebas borran los datos.');

export const config = {
  entorno: 'test', puerto: 0, host: '127.0.0.1', baseDatosUrl: URL_PRUEBAS,
  jwtSecreto: 'secreto-solo-para-pruebas-automaticas-0123456789', jwtExpiraSegundos: 3600,
  corsOrigen: ['http://localhost:8080'], nivelLog: 'silent', costoBcrypt: 4,
};

/** Deja la base de pruebas en estado conocido y devuelve app + pool listos. */
export async function preparar({ limiteIngreso = 1000 } = {}) {
  await migrar(URL_PRUEBAS, { silencioso: true });
  await sembrar(URL_PRUEBAS, CONTRASENA, { forzar: true, costoBcrypt: 4, silencioso: true });
  const pool = crearPool(URL_PRUEBAS);
  const app = await construirApp({ config, pool, limiteIngreso, registrar: false });
  await app.ready();
  return { app, pool, cerrar: async () => { await app.close(); await pool.end(); } };
}

export async function token(app, correo) {
  const r = await app.inject({ method: 'POST', url: `${PREFIJO}/auth/ingreso`, payload: { correo, contrasena: CONTRASENA } });
  assert.equal(r.statusCode, 200, r.body);
  return r.json().token;
}

// ---------- Validación de respuestas contra el contrato ----------
const contrato = cargarContrato();
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const reescribir = (n) => JSON.parse(JSON.stringify(n).replace(/"#\/components\/schemas\/(\w+)"/g, '"$1"'));
for (const [nombre, esquema] of Object.entries(contrato.components.schemas)) ajv.addSchema({ $id: nombre, ...reescribir(esquema) });

const porOperacion = {};
for (const item of Object.values(contrato.paths)) {
  for (const op of Object.values(item)) if (op?.operationId) porOperacion[op.operationId] = op;
}

/**
 * Comprueba que el código de estado esté documentado para la operación y que el cuerpo cumpla el esquema.
 * Así cada prueba es también una prueba de contrato.
 */
export function cumpleContrato(operationId, respuesta) {
  const op = porOperacion[operationId];
  assert.ok(op, `Operación desconocida: ${operationId}`);
  const codigo = String(respuesta.statusCode);
  let spec = op.responses[codigo];
  assert.ok(spec, `${operationId} respondió ${codigo}, que no está documentado en el contrato. Cuerpo: ${respuesta.body}`);
  if (spec.$ref) spec = contrato.components.responses[spec.$ref.split('/').pop()];
  const esquema = spec.content?.['application/json']?.schema;
  if (!esquema) {
    assert.equal(respuesta.body, '', `${operationId} ${codigo} no debería tener cuerpo`);
    return null;
  }
  const cuerpo = respuesta.json();
  const validar = ajv.compile(reescribir(esquema));
  assert.ok(validar(cuerpo), `${operationId} ${codigo} no cumple el contrato: ${ajv.errorsText(validar.errors)}\n${respuesta.body.slice(0, 500)}`);
  return cuerpo;
}

export { PREFIJO, contrato };
