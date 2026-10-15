import { ErrorApi } from '../errores.js';

export default ({ pool, version }) => ({
  async verificarSalud() {
    try {
      await pool.query('SELECT 1');
    } catch {
      throw new ErrorApi(503, 'SERVICIO_EXTERNO_NO_DISPONIBLE', 'La base de datos no responde.');
    }
    return { estado: 'ok', base_datos: 'ok', version };
  },
});
