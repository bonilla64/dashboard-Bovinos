// Carga api/openapi.yaml y lo convierte en la validación de cada ruta.
// Así el contrato es la única fuente de verdad: si cambia un límite en el YAML, cambia la validación.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import YAML from 'yaml';

export const RUTA_CONTRATO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'openapi.yaml');
const METODOS = ['get', 'post', 'put', 'patch', 'delete'];

export function cargarContrato(ruta = RUTA_CONTRATO) {
  return YAML.parse(readFileSync(ruta, 'utf8'));
}

// Quita lo que es solo documentación y convierte '#/components/schemas/X' en 'X#' (referencia de Fastify).
function adaptar(nodo) {
  if (Array.isArray(nodo)) return nodo.map(adaptar);
  if (!nodo || typeof nodo !== 'object') return nodo;
  const salida = {};
  for (const [clave, valor] of Object.entries(nodo)) {
    if (clave === 'example' || clave === 'examples' || clave.startsWith('x-')) continue;
    if (clave === '$ref' && typeof valor === 'string' && valor.startsWith('#/components/schemas/')) {
      salida.$ref = `${valor.split('/').pop()}#`;
      continue;
    }
    salida[clave] = adaptar(valor);
  }
  return salida;
}

function resolverParametro(contrato, p) {
  if (p.$ref) return contrato.components.parameters[p.$ref.split('/').pop()];
  return p;
}

/** Registra en Fastify cada esquema de components.schemas con su nombre como $id. */
export function registrarEsquemas(app, contrato) {
  for (const [nombre, esquema] of Object.entries(contrato.components.schemas)) {
    app.addSchema({ $id: nombre, ...adaptar(esquema) });
  }
}

/** Devuelve una lista de operaciones con lo necesario para registrarlas en Fastify. */
export function operaciones(contrato) {
  const lista = [];
  for (const [ruta, item] of Object.entries(contrato.paths)) {
    const comunes = item.parameters || [];
    for (const metodo of METODOS) {
      const op = item[metodo];
      if (!op) continue;
      const params = [...comunes, ...(op.parameters || [])].map((p) => resolverParametro(contrato, p));
      const esquema = {};
      for (const ubicacion of ['path', 'query']) {
        const lista = params.filter((p) => p.in === ubicacion);
        if (!lista.length) continue;
        esquema[ubicacion === 'path' ? 'params' : 'querystring'] = {
          type: 'object',
          properties: Object.fromEntries(lista.map((p) => [p.name, adaptar(p.schema)])),
          required: lista.filter((p) => p.required).map((p) => p.name),
        };
      }
      const cuerpo = op.requestBody?.content?.['application/json']?.schema;
      if (cuerpo) esquema.body = adaptar(cuerpo);
      const seguridad = op.security ?? contrato.security ?? [];
      lista.push({
        operationId: op.operationId,
        metodo: metodo.toUpperCase(),
        ruta: ruta.replace(/\{(\w+)\}/g, ':$1'),
        esquema,
        requiereSesion: seguridad.some((s) => Object.keys(s).length > 0),
        roles: op['x-roles'] || null,
      });
    }
  }
  return lista;
}
