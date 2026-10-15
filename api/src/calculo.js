// Cálculo de utilidad por destino. Función pura: no toca la base de datos, por eso se prueba sola.
// Es la misma fórmula que describe api/openapi.yaml (POST /simulaciones).

/**
 * @param {object} lote    { cantidad_animales, peso_total_kg }
 * @param {object} param   { flete_km_cop, capacidad_camion, flete_incluye_peajes }
 * @param {object} destino { comision_pct }
 * @param {object} ruta    { distancia_km, tiempo_horas, peajes_cop, factor_dificultad, merma_pct }
 * @param {number} precioKg
 */
export function calcularResultado(lote, param, destino, ruta, precioKg) {
  const camiones = Math.ceil(lote.cantidad_animales / param.capacidad_camion);
  const pesoVendido = Math.round(lote.peso_total_kg * (1 - ruta.merma_pct / 100) * 10) / 10;
  const ingresoBruto = Math.round(pesoVendido * precioKg);
  const comision = Math.round((ingresoBruto * destino.comision_pct) / 100);
  const flete = Math.round(ruta.distancia_km * param.flete_km_cop * ruta.factor_dificultad * camiones);
  const peajes = param.flete_incluye_peajes ? 0 : ruta.peajes_cop * camiones;
  const costo = flete + peajes + comision;
  return {
    distancia_km: ruta.distancia_km,
    tiempo_horas: ruta.tiempo_horas,
    merma_pct: ruta.merma_pct,
    camiones,
    peso_vendido_kg: pesoVendido,
    precio_kg_cop: precioKg,
    comision_cop: comision,
    flete_cop: flete,
    peajes_cop: peajes,
    costo_logistico_cop: costo,
    ingreso_bruto_cop: ingresoBruto,
    utilidad_neta_cop: ingresoBruto - costo,
  };
}

// Ordena de mayor a menor utilidad y asigna la posición (1 = mejor). En empate, gana la ruta más corta.
export function ordenarResultados(resultados) {
  resultados.sort((a, b) => b.utilidad_neta_cop - a.utilidad_neta_cop || a.distancia_km - b.distancia_km);
  resultados.forEach((r, i) => { r.posicion = i + 1; });
  return resultados;
}
