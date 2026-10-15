// Construye la aplicación Fastify. Se separa de servidor.js para poder probarla sin abrir un puerto.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { cargarContrato, operaciones, registrarEsquemas, RUTA_CONTRATO } from './contrato.js';
import { manejadorErrores, manejadorNoEncontrado } from './errores.js';
import { exigirSesion } from './auth.js';
import sistema from './rutas/sistema.js';
import autenticacion from './rutas/autenticacion.js';
import productores from './rutas/productores.js';
import lotes from './rutas/lotes.js';
import destinos from './rutas/destinos.js';
import simulaciones from './rutas/simulaciones.js';

export const PREFIJO = '/api/v1';

export async function construirApp({ config, pool, limiteIngreso = 10, registrar = true }) {
  const app = Fastify({
    // Detrás de un proxy (Render, nginx) la IP real del usuario viene en X-Forwarded-For;
    // sin esto, el límite de intentos de ingreso contaría a todos los usuarios como uno solo.
    trustProxy: config.confiarProxy ?? false,
    logger: registrar && {
      level: config.nivelLog,
      // Nunca se escriben en el log tokens ni contraseñas.
      redact: ['req.headers.authorization', 'req.body.contrasena'],
    },
    ajv: { customOptions: { allErrors: true, removeAdditional: false, useDefaults: true, coerceTypes: 'array' } },
  });

  const contrato = cargarContrato();

  await app.register(helmet, { global: true });
  await app.register(cors, { origin: config.corsOrigen, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  await app.register(jwt, { secret: config.jwtSecreto, sign: { algorithm: 'HS256' } });
  await app.register(rateLimit, { global: false });

  // Documentación interactiva servida desde el mismo contrato que valida las peticiones.
  await app.register(swagger, { mode: 'static', specification: { path: RUTA_CONTRATO, baseDir: '.' } });
  await app.register(swaggerUi, { routePrefix: '/docs', staticCSP: true, uiConfig: { docExpansion: 'list', persistAuthorization: true } });

  // Las hojas de precios llegan como texto CSV (POST /precios/importacion).
  app.addContentTypeParser('text/csv', { parseAs: 'string', bodyLimit: 1024 * 1024 }, (_, cuerpo, listo) => listo(null, cuerpo));

  app.setErrorHandler(manejadorErrores);
  app.setNotFoundHandler(manejadorNoEncontrado);
  app.get('/', { schema: { hide: true } }, async (_, respuesta) => respuesta.redirect('/docs'));

  const dependencias = { pool, config, app, version: contrato.info.version };
  const manejadores = {
    ...sistema(dependencias), ...autenticacion(dependencias), ...productores(dependencias),
    ...lotes(dependencias), ...destinos(dependencias), ...simulaciones(dependencias),
  };

  await app.register(async (api) => {
    registrarEsquemas(api, contrato);
    for (const op of operaciones(contrato)) {
      const manejador = manejadores[op.operationId];
      // Si el contrato declara una operación que nadie implementó, la API no arranca.
      if (!manejador) throw new Error(`Falta implementar la operación ${op.operationId} (${op.metodo} ${op.ruta}).`);
      const limitar = ['iniciarSesion', 'registrarUsuario'].includes(op.operationId);
      api.route({
        method: op.metodo,
        url: op.ruta,
        schema: op.esquema,
        config: limitar ? { rateLimit: { max: limiteIngreso, timeWindow: '1 minute' } } : {},
        preHandler: op.requiereSesion ? exigirSesion(op.roles) : undefined,
        handler: manejador,
      });
    }
  }, { prefix: PREFIJO });

  return app;
}
