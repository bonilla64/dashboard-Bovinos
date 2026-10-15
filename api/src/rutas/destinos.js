import { COL_DESTINO, COL_IMPORTACION, COL_PRECIO, COL_RUTA, actualizarFila, paginar } from '../consultas.js';
import { importarPrecios, leerCsv } from '../precios/importar.js';
import { conflicto, noEncontrado, validacion } from '../errores.js';

const EDITABLES_DESTINO = ['nombre', 'tipo', 'municipio', 'departamento', 'ubicacion', 'comision_pct', 'activo'];
const EDITABLES_PRECIO = ['precio_kg_cop', 'fecha', 'fuente', 'referencia'];
const EDITABLES_RUTA = ['distancia_km', 'tiempo_horas', 'peajes_cop', 'factor_dificultad', 'merma_pct', 'geometria', 'fuente'];

export default ({ pool }) => {
  async function destinoExiste(id, campo = null) {
    const { rows } = await pool.query(`SELECT ${COL_DESTINO} FROM destino WHERE id = $1`, [id]);
    if (!rows[0]) {
      if (campo) throw noEncontrado('No existe ese destino.', [{ campo, problema: 'Destino inexistente.' }]);
      throw noEncontrado('No existe ese destino.');
    }
    return rows[0];
  }
  async function nombreLibre(nombre, excepto = null) {
    const { rowCount } = await pool.query('SELECT 1 FROM destino WHERE lower(nombre) = lower($1) AND id IS DISTINCT FROM $2', [nombre, excepto]);
    if (rowCount) throw conflicto('Ya existe un destino con ese nombre.', [{ campo: 'nombre', problema: 'Nombre repetido.' }]);
  }
  async function usadoEnSimulaciones(columna, id) {
    const { rows } = await pool.query(`SELECT count(*) AS n FROM resultado_simulacion WHERE ${columna} = $1`, [id]);
    return rows[0].n;
  }

  return {
    // ---------- Destinos ----------
    async listarDestinos(peticion) {
      const q = peticion.query;
      const espacial = ['cerca_lat', 'cerca_lon', 'radio_km'];
      const presentes = espacial.filter((k) => q[k] !== undefined);
      if (presentes.length && presentes.length < 3) {
        throw validacion('El filtro espacial requiere cerca_lat, cerca_lon y radio_km juntos.',
          espacial.filter((k) => q[k] === undefined).map((campo) => ({ campo, problema: 'Falta el parámetro.' })));
      }
      const { pagina, porPagina, limite, desplazamiento } = paginar(q);
      const conFiltro = presentes.length === 3;
      const punto = 'ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography';
      const { rows } = await pool.query(
        `SELECT ${COL_DESTINO}, count(*) OVER () AS total
           ${conFiltro ? `, round((ST_Distance(ubicacion::geography, ${punto}) / 1000)::numeric, 1) AS distancia_lineal_km` : ''}
         FROM destino
         WHERE ($1::tipo_destino IS NULL OR tipo = $1)
           AND ($2::text IS NULL OR departamento ILIKE $2)
           AND activo = $3
           ${conFiltro ? `AND ST_DWithin(ubicacion::geography, ${punto}, $6 * 1000)` : 'AND $4::numeric IS NULL AND $5::numeric IS NULL AND $6::numeric IS NULL'}
         ORDER BY ${conFiltro ? 'distancia_lineal_km' : 'nombre'}
         LIMIT $7 OFFSET $8`,
        [q.tipo ?? null, q.departamento ?? null, q.activo ?? true,
          q.cerca_lat ?? null, q.cerca_lon ?? null, q.radio_km ?? null, limite, desplazamiento]);
      const total = rows[0]?.total ?? 0;
      rows.forEach((r) => delete r.total);
      return { datos: rows, pagina, por_pagina: porPagina, total };
    },

    async crearDestino(peticion, respuesta) {
      const b = peticion.body;
      await nombreLibre(b.nombre);
      const { rows } = await pool.query(
        `INSERT INTO destino (nombre, tipo, municipio, departamento, ubicacion, comision_pct, activo)
         VALUES ($1,$2,$3,$4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), $6, $7) RETURNING ${COL_DESTINO}`,
        [b.nombre, b.tipo, b.municipio, b.departamento, JSON.stringify(b.ubicacion), b.comision_pct ?? 0, b.activo ?? true]);
      respuesta.code(201).header('Location', `/api/v1/destinos/${rows[0].id}`);
      return rows[0];
    },

    async obtenerDestino(peticion) {
      return destinoExiste(peticion.params.destino_id);
    },

    async actualizarDestino(peticion) {
      const destino = await destinoExiste(peticion.params.destino_id);
      if (peticion.body.nombre) await nombreLibre(peticion.body.nombre, destino.id);
      return actualizarFila(pool, 'destino', destino.id, peticion.body, EDITABLES_DESTINO, COL_DESTINO);
    },

    async eliminarDestino(peticion, respuesta) {
      const destino = await destinoExiste(peticion.params.destino_id);
      const usos = await usadoEnSimulaciones('destino_id', destino.id);
      if (usos > 0) {
        throw conflicto(`El destino aparece en ${usos} resultados de simulaciones guardadas. Desactívelo (activo = false) en lugar de eliminarlo.`);
      }
      await pool.query('DELETE FROM destino WHERE id = $1', [destino.id]);
      return respuesta.code(204).send();
    },

    // ---------- Precios ----------
    async listarPreciosDestino(peticion) {
      await destinoExiste(peticion.params.destino_id);
      const q = peticion.query;
      const { rows } = await pool.query(
        `SELECT ${COL_PRECIO} FROM precio_mercado
         WHERE destino_id = $1 AND ($2::categoria_animal IS NULL OR categoria = $2)
           AND ($3::date IS NULL OR fecha >= $3) AND ($4::date IS NULL OR fecha <= $4)
         ORDER BY fecha DESC, categoria`,
        [peticion.params.destino_id, q.categoria ?? null, q.desde ?? null, q.hasta ?? null]);
      return rows;
    },

    async registrarPrecio(peticion, respuesta) {
      const destino = await destinoExiste(peticion.params.destino_id);
      const b = peticion.body;
      const repetido = await pool.query(
        'SELECT 1 FROM precio_mercado WHERE destino_id = $1 AND categoria = $2 AND fecha = $3', [destino.id, b.categoria, b.fecha]);
      if (repetido.rowCount) {
        throw conflicto(`Ya hay un precio de ${b.categoria} para ${destino.nombre} el ${b.fecha}.`,
          [{ campo: 'fecha', problema: 'Combinación destino + categoría + fecha repetida.' }]);
      }
      const { rows } = await pool.query(
        `INSERT INTO precio_mercado (destino_id, categoria, precio_kg_cop, fecha, fuente, referencia)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${COL_PRECIO}`,
        [destino.id, b.categoria, b.precio_kg_cop, b.fecha, b.fuente, b.referencia ?? null]);
      respuesta.code(201).header('Location', `/api/v1/precios/${rows[0].id}`);
      return rows[0];
    },

    async actualizarPrecio(peticion) {
      const id = peticion.params.precio_id;
      const actual = await pool.query('SELECT destino_id, categoria FROM precio_mercado WHERE id = $1', [id]);
      if (!actual.rowCount) throw noEncontrado('No existe ese precio.');
      if (peticion.body.fecha) {
        const { destino_id, categoria } = actual.rows[0];
        const choque = await pool.query(
          'SELECT 1 FROM precio_mercado WHERE destino_id = $1 AND categoria = $2 AND fecha = $3 AND id <> $4',
          [destino_id, categoria, peticion.body.fecha, id]);
        if (choque.rowCount) throw conflicto('Ya hay otro precio de esa categoría para ese destino en esa fecha.');
      }
      return actualizarFila(pool, 'precio_mercado', id, peticion.body, EDITABLES_PRECIO, COL_PRECIO);
    },

    async eliminarPrecio(peticion, respuesta) {
      const { rowCount } = await pool.query('DELETE FROM precio_mercado WHERE id = $1', [peticion.params.precio_id]);
      if (!rowCount) throw noEncontrado('No existe ese precio.');
      return respuesta.code(204).send();
    },

    async importarPrecios(peticion, respuesta) {
      const filas = leerCsv(peticion.body);
      const resultado = await importarPrecios(pool, filas, { origen: 'manual', usuarioId: peticion.user.sub });
      respuesta.code(201);
      return resultado;
    },

    async listarImportacionesPrecios() {
      const { rows } = await pool.query(`SELECT ${COL_IMPORTACION} FROM importacion_precio ORDER BY creado_en DESC LIMIT 20`);
      return rows;
    },

    // ---------- Rutas ----------
    async listarRutas(peticion) {
      const q = peticion.query;
      const { rows } = await pool.query(
        `SELECT ${COL_RUTA} FROM ruta
         WHERE ($1::uuid IS NULL OR destino_id = $1) AND ($2::numeric IS NULL OR distancia_km <= $2)
           AND ($3::text IS NULL OR origen_nombre = $3)
         ORDER BY distancia_km`,
        [q.destino_id ?? null, q.max_distancia_km ?? null, q.origen ?? null]);
      return rows;
    },

    async crearRuta(peticion, respuesta) {
      const b = peticion.body;
      await destinoExiste(b.destino_id, 'destino_id');
      const origenNombre = b.origen_nombre ?? 'Yopal (centro de acopio)';
      const repetida = await pool.query('SELECT 1 FROM ruta WHERE destino_id = $1 AND origen_nombre = $2', [b.destino_id, origenNombre]);
      if (repetida.rowCount) throw conflicto('Ese destino ya tiene una ruta desde ese origen. Corríjala con PATCH.');
      const origen = b.origen ?? { type: 'Point', coordinates: b.geometria.coordinates[0] };
      const { rows } = await pool.query(
        `INSERT INTO ruta (destino_id, origen_nombre, origen, distancia_km, tiempo_horas, peajes_cop, factor_dificultad, merma_pct, geometria, fuente)
         VALUES ($1,$2, ST_SetSRID(ST_GeomFromGeoJSON($3),4326), $4,$5,$6,$7,$8, ST_SetSRID(ST_GeomFromGeoJSON($9),4326), $10)
         RETURNING ${COL_RUTA}`,
        [b.destino_id, origenNombre, JSON.stringify(origen), b.distancia_km, b.tiempo_horas, b.peajes_cop ?? 0,
          b.factor_dificultad ?? 1, b.merma_pct ?? 0, JSON.stringify(b.geometria), b.fuente ?? 'manual']);
      respuesta.code(201).header('Location', `/api/v1/rutas/${rows[0].id}`);
      return rows[0];
    },

    async obtenerRuta(peticion) {
      const { rows } = await pool.query(`SELECT ${COL_RUTA} FROM ruta WHERE id = $1`, [peticion.params.ruta_id]);
      if (!rows[0]) throw noEncontrado('No existe esa ruta.');
      return rows[0];
    },

    async actualizarRuta(peticion) {
      const fila = await actualizarFila(pool, 'ruta', peticion.params.ruta_id, peticion.body, EDITABLES_RUTA, COL_RUTA);
      if (!fila) throw noEncontrado('No existe esa ruta.');
      return fila;
    },

    async eliminarRuta(peticion, respuesta) {
      const id = peticion.params.ruta_id;
      const existe = await pool.query('SELECT 1 FROM ruta WHERE id = $1', [id]);
      if (!existe.rowCount) throw noEncontrado('No existe esa ruta.');
      const usos = await usadoEnSimulaciones('ruta_id', id);
      if (usos > 0) throw conflicto(`La ruta aparece en ${usos} resultados de simulaciones guardadas; corríjala con PATCH en lugar de eliminarla.`);
      await pool.query('DELETE FROM ruta WHERE id = $1', [id]);
      return respuesta.code(204).send();
    },
  };
};
