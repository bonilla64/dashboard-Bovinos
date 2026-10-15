// Rutas desde el municipio donde está el lote.
//
// La semilla trae rutas medidas desde Yopal (centro de acopio). Cuando un lote sale de otro
// municipio de Casanare, la ruta a cada destino se obtiene así, y se guarda para no repetirla:
//   1. OSRM (si OSRM_BASE_URL está configurado y responde en menos de 5 s): distancia, tiempo y trazado reales.
//   2. Si no, una estimación: línea recta × sinuosidad de la vía, sin pasar de ir por Yopal.
// La merma y los peajes se interpolan por distancia con las rutas medidas desde Yopal, y el
// recargo de la vía se toma de la ruta Yopal → destino (cruzar la cordillera cuesta lo mismo).
// Cada ruta queda con su `fuente` (osrm o respaldo_linea_recta) para que el tablero lo diga.

export const ORIGEN_YOPAL = 'Yopal (centro de acopio)';

// Cabeceras municipales de Casanare (longitud, latitud aproximadas, EPSG:4326).
// Fuente: coordenadas de las cabeceras según DANE/IGAC, redondeadas a 4 decimales.
export const MUNICIPIOS = {
  Yopal: [-72.3959, 5.3371],
  Aguazul: [-72.5547, 5.1727],
  Chámeza: [-72.8717, 5.2139],
  'Hato Corozal': [-71.7653, 6.1561],
  'La Salina': [-72.3347, 6.1278],
  Maní: [-72.2794, 4.8166],
  Monterrey: [-72.8956, 4.8786],
  Nunchía: [-72.1956, 5.6372],
  Orocué: [-71.3394, 4.7908],
  'Paz de Ariporo': [-71.8919, 5.8811],
  Pore: [-71.9928, 5.7278],
  Recetor: [-72.7614, 5.2292],
  Sabanalarga: [-73.04, 4.8544],
  Sácama: [-72.2486, 6.0981],
  'San Luis de Palenque': [-71.7314, 5.4222],
  Támara: [-72.1622, 5.8297],
  Tauramena: [-72.7475, 5.018],
  Trinidad: [-71.6625, 5.4092],
  Villanueva: [-72.9286, 4.6106],
};

const quitarTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const PORNOMBRE = new Map(Object.keys(MUNICIPIOS).map((m) => [quitarTildes(m), m]));

/** Devuelve el nombre oficial del municipio de Casanare, o null si no se reconoce. */
export function municipioCasanare(texto) {
  return PORNOMBRE.get(quitarTildes(String(texto ?? ''))) ?? null;
}

/** Nombre con el que se guarda el origen en la tabla ruta. */
export function nombreOrigen(municipio) {
  return municipio === 'Yopal' ? ORIGEN_YOPAL : municipio;
}

export function distanciaLinealKm([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Interpolación lineal por tramos sobre puntos [x, y] ordenados por x. */
export function interpolar(puntos, x) {
  if (!puntos.length) return 0;
  if (x <= puntos[0][0]) return puntos[0][1];
  for (let i = 1; i < puntos.length; i += 1) {
    const [x0, y0] = puntos[i - 1];
    const [x1, y1] = puntos[i];
    if (x <= x1) return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return puntos[puntos.length - 1][1];
}

const redondear = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Estima una ruta origen → destino a partir de las rutas medidas desde Yopal. Función pura.
 * @param {number[]} origen       [lon, lat] del municipio
 * @param {object}   destino      { tipo, ubicacion: {coordinates} }
 * @param {object}   rutaYopal    ruta Yopal → este destino (puede faltar)
 * @param {object[]} rutasYopal   todas las rutas medidas desde Yopal (para interpolar merma y peajes)
 * @param {object}   [osrm]       { distancia_km, tiempo_horas, geometria } si OSRM respondió
 */
export function estimarRuta(origen, destino, rutaYopal, rutasYopal, osrm = null) {
  const punto = destino.ubicacion.coordinates;
  if (destino.tipo === 'finca') {
    // Venta en la propia finca: no hay viaje.
    return { distancia_km: 0, tiempo_horas: 0, peajes_cop: 0, factor_dificultad: 1, merma_pct: 0,
      geometria: { type: 'LineString', coordinates: [origen, origen] }, fuente: 'manual' };
  }
  const medidas = rutasYopal.filter((r) => Number(r.distancia_km) > 0)
    .map((r) => ({ d: Number(r.distancia_km), t: Number(r.tiempo_horas), m: Number(r.merma_pct), p: Number(r.peajes_cop) }))
    .sort((a, b) => a.d - b.d);
  const mermaPorKm = [[0, 0], ...medidas.map((r) => [r.d, r.m])];
  const peajesPorKm = [[0, 0], ...medidas.map((r) => [r.d, r.p])];
  const velocidad = medidas.length ? medidas.reduce((s, r) => s + r.d, 0) / medidas.reduce((s, r) => s + r.t, 0) : 45;

  let distancia;
  let tiempo;
  let geometria;
  let fuente;
  if (osrm) {
    ({ distancia_km: distancia, tiempo_horas: tiempo, geometria } = osrm);
    fuente = 'osrm';
  } else {
    // Sinuosidad de la vía hacia ese destino, medida en la ruta desde Yopal (entre 1,15 y 1,6).
    const yopal = MUNICIPIOS.Yopal;
    const lineaYopal = distanciaLinealKm(yopal, punto);
    const sinuosidad = rutaYopal && lineaYopal > 20
      ? Math.min(1.6, Math.max(1.15, Number(rutaYopal.distancia_km) / lineaYopal)) : 1.3;
    const directa = distanciaLinealKm(origen, punto) * sinuosidad;
    // Límites con la ruta medida desde Yopal: nunca más largo que ir hasta Yopal y seguir. Si el destino
    // está al otro lado de la cordillera (recargo ≥ 1,15), la cordillera solo se cruza por ciertos pasos:
    // desde un origen más lejano que Yopal se va por Yopal, y desde uno más cercano no puede ser más
    // corto que la ruta de Yopal menos el tramo hasta Yopal.
    const tramoYopal = distanciaLinealKm(origen, yopal) * 1.2;
    const porYopal = rutaYopal ? tramoYopal + Number(rutaYopal.distancia_km) : Infinity;
    const cruzaCordillera = rutaYopal && Number(rutaYopal.factor_dificultad) >= 1.15;
    if (cruzaCordillera && distanciaLinealKm(origen, punto) >= lineaYopal) {
      // El origen queda «detrás» de Yopal (p. ej. Paz de Ariporo → Sogamoso): la vía pasa por Yopal.
      distancia = porYopal;
    } else {
      const minimo = cruzaCordillera ? Number(rutaYopal.distancia_km) - tramoYopal : 0;
      distancia = Math.max(3, minimo, Math.min(directa, porYopal));
    }
    tiempo = distancia / velocidad;
    geometria = { type: 'LineString', coordinates: [origen, punto] };
    fuente = 'respaldo_linea_recta';
  }
  distancia = redondear(Math.min(distancia, 3000));
  return {
    distancia_km: distancia,
    tiempo_horas: redondear(Math.min(Math.max(tiempo, 0.1), 72)),
    peajes_cop: Math.round(interpolar(peajesPorKm, distancia) / 100) * 100,
    factor_dificultad: rutaYopal ? Number(rutaYopal.factor_dificultad) : 1,
    merma_pct: redondear(Math.min(15, interpolar(mermaPorKm, distancia))),
    geometria,
    fuente,
  };
}

/** Pide la ruta a OSRM. Devuelve null si no está configurado, tarda más de `espera` ms o falla. */
export async function consultarOsrm(base, origen, destino, espera = 5000) {
  if (!base) return null;
  const url = `${base.replace(/\/+$/, '')}/route/v1/driving/${origen.join(',')};${destino.join(',')}?overview=simplified&geometries=geojson`;
  try {
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(espera), headers: { 'User-Agent': 'simulador-destinos-ganaderos (Unitropico)' } });
    if (!respuesta.ok) return null;
    const json = await respuesta.json();
    const ruta = json.routes?.[0];
    if (json.code !== 'Ok' || !ruta || ruta.geometry?.coordinates?.length < 2) return null;
    return {
      distancia_km: ruta.distance / 1000,
      tiempo_horas: ruta.duration / 3600,
      geometria: { type: 'LineString', coordinates: ruta.geometry.coordinates.map(([x, y]) => [redondear(x, 5), redondear(y, 5)]) },
    };
  } catch {
    return null;
  }
}

/**
 * Busca la ruta desde el municipio del lote hacia el destino; si no existe, la calcula y la guarda.
 * Si el municipio no es de Casanare, usa la ruta desde Yopal (comportamiento anterior).
 */
export async function rutaDesde(bd, municipioTexto, destino, { osrmBaseUrl = '' } = {}) {
  const COLS = 'id, distancia_km, tiempo_horas, peajes_cop, factor_dificultad, merma_pct, fuente, origen_nombre';
  const municipio = municipioCasanare(municipioTexto);
  const nombre = municipio ? nombreOrigen(municipio) : ORIGEN_YOPAL;
  const { rows: [existente] } = await bd.query(`SELECT ${COLS} FROM ruta WHERE destino_id = $1 AND origen_nombre = $2`, [destino.id, nombre]);
  if (existente) return existente;
  if (!municipio || municipio === 'Yopal') return null;

  const { rows: rutasYopal } = await bd.query('SELECT destino_id, distancia_km, tiempo_horas, peajes_cop, merma_pct, factor_dificultad FROM ruta WHERE origen_nombre = $1', [ORIGEN_YOPAL]);
  const rutaYopal = rutasYopal.find((r) => r.destino_id === destino.id);
  const origen = MUNICIPIOS[municipio];
  const osrm = destino.tipo === 'finca' ? null : await consultarOsrm(osrmBaseUrl, origen, destino.ubicacion.coordinates);
  const r = estimarRuta(origen, destino, rutaYopal, rutasYopal, osrm);
  const { rows: [nueva] } = await bd.query(
    `INSERT INTO ruta (destino_id, origen_nombre, origen, distancia_km, tiempo_horas, peajes_cop, factor_dificultad, merma_pct, geometria, fuente)
     VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4, $5, $6, $7, $8, ST_SetSRID(ST_GeomFromGeoJSON($9), 4326), $10)
     ON CONFLICT (destino_id, origen_nombre) DO UPDATE SET actualizado_en = ruta.actualizado_en
     RETURNING ${COLS}`,
    [destino.id, nombre, JSON.stringify({ type: 'Point', coordinates: origen }), r.distancia_km, r.tiempo_horas, r.peajes_cop,
      r.factor_dificultad, r.merma_pct, JSON.stringify(r.geometria), r.fuente]);
  return nueva;
}
