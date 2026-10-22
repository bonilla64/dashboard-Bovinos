// El contrato mismo también se prueba: sus ejemplos deben cumplir sus esquemas
// y cada operación declarada debe estar implementada (si no, construirApp falla).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { contrato } from './ayuda.js';
import { operaciones } from '../src/contrato.js';

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const reescribir = (n) => JSON.parse(JSON.stringify(n).replace(/"#\/components\/schemas\/(\w+)"/g, '"$1"'));
for (const [nombre, esquema] of Object.entries(contrato.components.schemas)) ajv.addSchema({ $id: nombre, ...reescribir(esquema) });

function* ejemplos() {
  for (const [ruta, item] of Object.entries(contrato.paths)) {
    for (const [metodo, op] of Object.entries(item)) {
      if (!op?.responses) continue;
      const cuerpo = op.requestBody?.content?.['application/json'];
      if (cuerpo?.example) yield [`${metodo.toUpperCase()} ${ruta} (petición)`, cuerpo.schema, cuerpo.example];
      for (const [codigo, r0] of Object.entries(op.responses)) {
        const r = r0.$ref ? contrato.components.responses[r0.$ref.split('/').pop()] : r0;
        const c = r.content?.['application/json'];
        if (!c) continue;
        if (c.example) yield [`${metodo.toUpperCase()} ${ruta} ${codigo}`, c.schema, c.example];
        for (const [n, e] of Object.entries(c.examples || {})) {
          const valor = e.$ref ? contrato.components.examples[e.$ref.split('/').pop()].value : e.value;
          yield [`${metodo.toUpperCase()} ${ruta} ${codigo} (${n})`, c.schema, valor];
        }
      }
    }
  }
}

test('todos los ejemplos del contrato cumplen su esquema', () => {
  let n = 0;
  for (const [donde, esquema, valor] of ejemplos()) {
    const validar = ajv.compile(reescribir(esquema));
    assert.ok(validar(valor), `${donde}: ${ajv.errorsText(validar.errors)}`);
    n += 1;
  }
  assert.ok(n > 20, `se esperaban más de 20 ejemplos y hay ${n}`);
});

test('el contrato cubre CRUD completo de al menos cuatro recursos', () => {
  const ops = operaciones(contrato).map((o) => `${o.metodo} ${o.ruta}`);
  const recursos = ['productores', 'lotes', 'destinos', 'rutas', 'simulaciones'];
  const completos = recursos.filter((r) => ['GET', 'POST'].every((m) => ops.includes(`${m} /${r}`))
    && ops.some((o) => o.startsWith(`DELETE /${r}/`)) && ops.some((o) => o.startsWith(`GET /${r}/`)));
  assert.ok(completos.length >= 4, `recursos con CRUD: ${completos.join(', ')}`);
});

test('toda operación que modifica datos exige sesión, salvo registro, ingreso y solicitud de recuperación', () => {
  const abiertas = operaciones(contrato).filter((o) => o.metodo !== 'GET' && !o.requiereSesion).map((o) => o.operationId);
  assert.deepEqual(abiertas.sort(), ['iniciarSesion', 'registrarUsuario', 'solicitarRecuperacion']);
});
