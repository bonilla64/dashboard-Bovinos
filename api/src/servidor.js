// Punto de entrada: lee la configuración, conecta a la base de datos y abre el puerto.
import { leerConfig } from './config.js';
import { crearPool } from './bd.js';
import { construirApp } from './app.js';

const config = leerConfig();
const pool = crearPool(config.baseDatosUrl);
const app = await construirApp({ config, pool });

const cerrar = async (senal) => {
  app.log.info(`Recibida ${senal}, cerrando…`);
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);

try {
  await app.listen({ port: config.puerto, host: config.host });
} catch (e) {
  app.log.error(e);
  process.exit(1);
}
