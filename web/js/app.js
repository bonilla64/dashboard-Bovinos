/* Simulador de Destinos Ganaderos · prototipo navegable (Entrega 2)
 *
 * Un solo archivo para las tres pantallas; cada página se identifica con
 * <body data-pagina="...">. Los datos se leen de datos/ejemplo.json, que tiene
 * la misma forma que las respuestas de api/openapi.yaml. En la Entrega 3 la
 * función cargarDatos() se reemplaza por llamadas a la API real.
 *
 * Estados de demostración: agregar ?demo=cargando | ?demo=vacio | ?demo=error a la URL.
 */
"use strict";

const RUTA_DATOS = "datos/ejemplo.json";
const CLAVE_LOTE = "sdg.loteActivo";
const params = new URLSearchParams(window.location.search);
const DEMO = params.get("demo");

/* ------------------------------------------------------------------ */
/* Utilidades de formato                                               */
/* ------------------------------------------------------------------ */

const numero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fechaCorta = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" });
const fechaLarga = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });

const fmt = {
  cop: (v) => pesos.format(v).replace(/\u00a0/g, " "),
  millones: (v) => {
    const signo = v < 0 ? "−" : "";
    return `${signo}$${numero.format(Math.abs(v) / 1e6)} millones`;
  },
  diferencia: (v) => {
    const abs = Math.abs(v);
    if (abs < 1000) return "Igual";
    const signo = v > 0 ? "+" : "−";
    if (abs < 1e6) return `${signo}$${Math.round(abs / 1000)} mil`;
    return `${signo}$${numero.format(abs / 1e6)} M`;
  },
  km: (v) => `${numero.format(v)} km`,
  horas: (v) => (v < 1 ? `${Math.round(v * 60)} min` : `${numero.format(v)} h`),
  kg: (v) => `${numero.format(v)} kg`,
  pct: (v) => `${numero.format(v)} %`,
  fecha: (iso) => fechaCorta.format(new Date(iso)),
  fechaHora: (iso) => fechaLarga.format(new Date(iso)),
};

const CATEGORIAS = {
  novillo_gordo: ["novillo gordo", "novillos gordos"],
  vaca_gorda: ["vaca gorda", "vacas gordas"],
  novillo_levante: ["novillo de levante", "novillos de levante"],
  ternero_destete: ["ternero de destete", "terneros de destete"],
  toro: ["toro", "toros"],
};
const TIPOS = { subasta: "Subasta", feria: "Feria", frigorifico: "Frigorífico", planta_beneficio: "Planta de beneficio" };

function animales(n, categoria) {
  const [uno, varios] = CATEGORIAS[categoria] || ["animal", "animales"];
  return `${n} ${n === 1 ? uno : varios}`;
}

function $(sel, raiz = document) { return raiz.querySelector(sel); }
function $$(sel, raiz = document) { return Array.from(raiz.querySelectorAll(sel)); }
function espera(ms) { return new Promise((ok) => setTimeout(ok, ms)); }
function escapar(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

async function cargarDatos() {
  if (DEMO === "cargando") return new Promise(() => {});           // nunca termina: muestra el estado de carga
  if (DEMO === "error") {
    await espera(800);
    throw new Error("El servidor respondió con el código 503 (servicio no disponible).");
  }
  const respuesta = await fetch(RUTA_DATOS, { cache: "no-cache" });
  if (!respuesta.ok) throw new Error(`El servidor respondió con el código ${respuesta.status}.`);
  return respuesta.json();
}

function mostrarEstado(nombre) {
  // nombre: "cargando" | "error" | "datos"
  const cargando = $("#estado-cargando");
  const error = $("#estado-error");
  const datos = $("#con-datos");
  if (cargando) cargando.hidden = nombre !== "cargando";
  if (error) error.hidden = nombre !== "error";
  if (datos) datos.hidden = nombre !== "datos";
}

function precioVigente(datos, destinoId, categoria) {
  return datos.precios
    .filter((p) => p.destino_id === destinoId && p.categoria === categoria)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
}

/**
 * Mismo cálculo que hará POST /simulaciones en la Entrega 3.
 * Devuelve los resultados ordenados por utilidad y los destinos que no se pudieron calcular.
 */
function calcular(datos, lote, fleteKm, destinoIds) {
  const pesoTotal = lote.cantidad_animales * lote.peso_promedio_kg;
  const resultados = [];
  const sinCalcular = [];
  destinoIds.forEach((id) => {
    const destino = datos.destinos.find((d) => d.id === id);
    const ruta = datos.rutas.find((r) => r.destino_id === id);
    const precio = precioVigente(datos, id, lote.categoria);
    if (!destino || !ruta || !precio) { sinCalcular.push(destino ? destino.nombre : id); return; }
    const pesoVendido = Math.round(pesoTotal * (1 - ruta.merma_pct / 100) * 10) / 10;
    const flete = Math.round(ruta.distancia_km * fleteKm * ruta.factor_dificultad);
    const costo = flete + ruta.peajes_cop;
    const ingreso = Math.round(pesoVendido * precio.precio_kg_cop);
    resultados.push({
      destino_id: id, ruta_id: ruta.id, distancia_km: ruta.distancia_km, tiempo_horas: ruta.tiempo_horas,
      merma_pct: ruta.merma_pct, peso_vendido_kg: pesoVendido, precio_kg_cop: precio.precio_kg_cop,
      flete_cop: flete, peajes_cop: ruta.peajes_cop, costo_logistico_cop: costo,
      ingreso_bruto_cop: ingreso, utilidad_neta_cop: ingreso - costo,
    });
  });
  ordenar(resultados);
  return { resultados, sinCalcular };
}

function ordenar(resultados) {
  resultados.sort((a, b) => b.utilidad_neta_cop - a.utilidad_neta_cop);
  resultados.forEach((r, i) => { r.posicion = i + 1; });
  return resultados;
}

function leerLoteLocal() {
  try {
    const texto = window.localStorage.getItem(CLAVE_LOTE);
    return texto ? JSON.parse(texto) : null;
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Pantalla principal: tablero                                         */
/* ------------------------------------------------------------------ */

const tablero = {
  datos: null,
  contexto: null,      // { lote, fleteKm, resultados, guardada }
  visibles: [],
  seleccionado: null,
  mapa: null,
  capa: null,
  capasPorDestino: new Map(),
  erroresTeselas: 0,
};

function contextoTablero(datos) {
  const idSim = params.get("simulacion");
  if (idSim) {
    const sim = datos.simulaciones.find((s) => s.id === idSim);
    if (sim) {
      const lote = datos.lotes.find((l) => l.id === sim.lote_id);
      return { lote, fleteKm: sim.flete_km_cop, resultados: ordenar(sim.resultados.map((r) => ({ ...r }))), guardada: sim, sinCalcular: [] };
    }
  }
  let lote = null;
  let fleteKm = Number(params.get("flete")) || datos.flete_km_cop_por_defecto;
  let destinoIds = datos.destinos.filter((d) => d.activo).map((d) => d.id);

  if (params.get("lote") === "local") {
    const local = leerLoteLocal();
    if (local) {
      lote = local;
      fleteKm = local.flete_km_cop;
      destinoIds = local.destino_ids;
    }
  } else if (params.get("lote")) {
    lote = datos.lotes.find((l) => l.id === params.get("lote")) || null;
  }
  if (!lote) lote = datos.lotes[0];
  const { resultados, sinCalcular } = calcular(datos, lote, fleteKm, destinoIds);
  return { lote, fleteKm, resultados, guardada: null, sinCalcular };
}

async function iniciarTablero() {
  mostrarEstado("cargando");
  try {
    tablero.datos = await cargarDatos();
  } catch (e) {
    $("#error-detalle").textContent = `${e.message} Sus datos del lote no se perdieron.`;
    mostrarEstado("error");
    $("#estado-error h1").focus?.();
    return;
  }
  tablero.contexto = contextoTablero(tablero.datos);
  mostrarEstado("datos");
  pintarEncabezadoLote();
  iniciarMapa();
  conectarFiltros();
  if (DEMO === "vacio") {
    // Demostración del estado vacío con un caso real: solo plantas de beneficio a menos de 100 km.
    $$('#filtro-tipos input').forEach((c) => { c.checked = c.value === "planta_beneficio"; });
    $("#filtro-distancia").value = 100;
  }
  renderTablero();
}

function pintarEncabezadoLote() {
  const { lote, fleteKm, guardada } = tablero.contexto;
  const peso = lote.cantidad_animales * lote.peso_promedio_kg;
  const finca = lote.finca ? `, ${lote.finca} (${lote.municipio_origen})` : `, ${lote.municipio_origen}`;
  $("#lote-resumen").innerHTML =
    `Lote activo: <strong>${escapar(lote.nombre)}</strong>. ${animales(lote.cantidad_animales, lote.categoria)}, ${fmt.kg(peso)}${escapar(finca)}. Flete de ${fmt.cop(fleteKm)} por km.`;
  $("#enlace-editar-lote").href = lote.id ? `detalle.html?lote=${encodeURIComponent(lote.id)}` : "detalle.html?lote=local";

  const aviso = $("#aviso-simulacion");
  if (guardada) {
    aviso.hidden = false;
    aviso.innerHTML = `<p>Está viendo la simulación guardada el ${fmt.fechaHora(guardada.creado_en)}, con los precios de ese día.
      <a href="index.html?lote=${encodeURIComponent(lote.id)}&amp;flete=${guardada.flete_km_cop}">Recalcular con los precios actuales</a>.</p>`;
  } else if (tablero.contexto.sinCalcular.length) {
    aviso.hidden = false;
    aviso.innerHTML = `<p>No hay precio de ${escapar(CATEGORIAS[lote.categoria][0])} para: ${tablero.contexto.sinCalcular.map(escapar).join(", ")}. Esos destinos no se comparan.</p>`;
  }
}

function conectarFiltros() {
  $$("#filtro-tipos input").forEach((c) => c.addEventListener("change", renderTablero));
  const rango = $("#filtro-distancia");
  rango.addEventListener("input", () => {
    $("#filtro-distancia-valor").textContent = `Hasta ${rango.value} km`;
    renderTablero();
  });
  const quitar = () => {
    $$("#filtro-tipos input").forEach((c) => { c.checked = true; });
    rango.value = rango.max;
    renderTablero();
  };
  $("#btn-quitar-filtros").addEventListener("click", quitar);
  $("#btn-vacio-quitar").addEventListener("click", () => { quitar(); $("#t-respuesta").focus?.(); });
}

function destinoDe(id) { return tablero.datos.destinos.find((d) => d.id === id); }
function rutaDe(id) { return tablero.datos.rutas.find((r) => r.destino_id === id); }

function renderTablero() {
  const tipos = $$("#filtro-tipos input:checked").map((c) => c.value);
  const maxKm = Number($("#filtro-distancia").value);
  $("#filtro-distancia-valor").textContent = `Hasta ${maxKm} km`;

  const visibles = tablero.contexto.resultados
    .filter((r) => tipos.includes(destinoDe(r.destino_id).tipo) && r.distancia_km <= maxKm)
    .map((r) => ({ ...r }));
  ordenar(visibles);
  tablero.visibles = visibles;

  const vacio = visibles.length === 0;
  $("#estado-vacio").hidden = !vacio;
  $("#visualizaciones").hidden = vacio;

  if (vacio) {
    $("#t-respuesta").textContent = "¿A dónde llevo el lote?";
    $("#respuesta-cifra").textContent = "Ningún destino cumple los filtros actuales.";
    return;
  }
  if (!visibles.some((r) => r.destino_id === tablero.seleccionado)) tablero.seleccionado = visibles[0].destino_id;

  pintarRespuesta(visibles);
  pintarGrafico(visibles);
  pintarTabla(visibles);
  pintarMapa(visibles);
  marcarSeleccion(false);
}

function baseDeComparacion(visibles) {
  // Se compara contra vender cerca: el destino más cercano del conjunto visible.
  return visibles.reduce((a, b) => (b.distancia_km < a.distancia_km ? b : a));
}

function pintarRespuesta(visibles) {
  const mejor = visibles[0];
  const d = destinoDe(mejor.destino_id);
  const base = baseDeComparacion(visibles);
  const dBase = destinoDe(base.destino_id);
  $("#t-respuesta").textContent = `Llévelo a ${d.nombre}, en ${d.municipio}`;

  let texto = `Le quedan <strong>${fmt.millones(mejor.utilidad_neta_cop)}</strong> después de pagar ${fmt.millones(mejor.costo_logistico_cop)} de flete y peajes.`;
  if (visibles.length > 1) {
    const segundo = visibles[1];
    texto += ` Son <strong>${fmt.millones(mejor.utilidad_neta_cop - segundo.utilidad_neta_cop)}</strong> más que en ${escapar(destinoDe(segundo.destino_id).nombre)}`;
    if (base.destino_id !== mejor.destino_id && base.destino_id !== segundo.destino_id) {
      texto += ` y ${fmt.millones(mejor.utilidad_neta_cop - base.utilidad_neta_cop)} más que vendiendo en ${escapar(dBase.nombre)}`;
    }
    texto += ".";
  }
  if (base.destino_id === mejor.destino_id && visibles.length > 1) {
    texto += " Vender cerca deja más: el mejor precio de los destinos lejanos no alcanza a pagar el flete y el peso que pierden los animales en el viaje.";
  }
  $("#respuesta-cifra").innerHTML = texto;
}

function pintarGrafico(visibles) {
  const base = baseDeComparacion(visibles);
  $("#grafico-base").textContent =
    `Cada barra es la diferencia de utilidad frente a vender en ${destinoDe(base.destino_id).nombre} (${fmt.km(base.distancia_km)}), el destino más cercano.`;

  const difs = visibles.map((r) => r.utilidad_neta_cop - base.utilidad_neta_cop);
  const min = Math.min(0, ...difs);
  const max = Math.max(0, ...difs);
  const rango = max - min || 1;
  const cero = (-min / rango) * 100;

  const filas = visibles.map((r, i) => {
    const d = destinoDe(r.destino_id);
    const dif = difs[i];
    const ancho = (Math.abs(dif) / rango) * 100;
    const izquierda = dif >= 0 ? cero : cero - ancho;
    const clase = r.posicion === 1 ? "relleno relleno--mejor" : dif < 0 ? "relleno relleno--perdida" : "relleno";
    const valor = r.destino_id === base.destino_id ? "Base" : fmt.diferencia(dif);
    const leer = r.destino_id === base.destino_id
      ? "punto de comparación"
      : `${dif >= 0 ? "gana" : "pierde"} ${fmt.millones(Math.abs(dif))} frente a vender cerca`;
    return `<li>
      <button type="button" class="barra-fila" data-destino="${r.destino_id}" aria-pressed="false">
        <span class="barra-nombre">${escapar(d.nombre)}</span>
        <span class="barra-valor ${dif < 0 ? "negativo" : ""}">${valor}<span class="sr-only">: ${leer}. Utilidad ${fmt.millones(r.utilidad_neta_cop)}.</span></span>
        <span class="pista" aria-hidden="true">
          <span class="${clase}" style="left:${izquierda}%;width:${Math.max(ancho, 0.6)}%"></span>
          <span class="cero" style="left:${cero}%"></span>
        </span>
      </button>
    </li>`;
  });
  $("#grafico").innerHTML = `<ul class="barras">${filas.join("")}</ul>`;
  $$("#grafico .barra-fila").forEach((b) => b.addEventListener("click", () => seleccionar(b.dataset.destino, true)));
}

function pintarTabla(visibles) {
  const { lote } = tablero.contexto;
  $("#tabla-caption").textContent =
    `Utilidad estimada de ${animales(lote.cantidad_animales, lote.categoria)} (${fmt.kg(lote.cantidad_animales * lote.peso_promedio_kg)}) por destino`;
  $("#tabla-cuerpo").innerHTML = visibles.map((r) => {
    const d = destinoDe(r.destino_id);
    const mejor = r.posicion === 1 ? ' <span class="etiqueta">Mejor</span>' : "";
    return `<tr data-destino="${r.destino_id}" class="${r.posicion === 1 ? "es-mejor" : ""}">
      <th scope="row" class="fila-destino">${escapar(d.nombre)}${mejor}<small>${TIPOS[d.tipo]}, ${escapar(d.municipio)}</small></th>
      <td>${fmt.km(r.distancia_km)}</td>
      <td>${fmt.horas(r.tiempo_horas)}</td>
      <td>${fmt.pct(r.merma_pct)}</td>
      <td>${fmt.cop(r.precio_kg_cop)}</td>
      <td>${fmt.cop(r.flete_cop)}</td>
      <td>${fmt.cop(r.peajes_cop)}</td>
      <td class="${r.utilidad_neta_cop < 0 ? "negativo" : ""}"><strong>${fmt.cop(r.utilidad_neta_cop)}</strong></td>
      <td><button type="button" class="boton boton--secundario boton--peq" data-destino="${r.destino_id}" aria-pressed="false">Ver en mapa<span class="sr-only">: ${escapar(d.nombre)}</span></button></td>
    </tr>`;
  }).join("");
  $$("#tabla-cuerpo button").forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); seleccionar(b.dataset.destino, true); }));
  $$("#tabla-cuerpo tr").forEach((tr) => tr.addEventListener("click", () => seleccionar(tr.dataset.destino, true)));
}

/* ---------- Mapa (Leaflet) ---------- */

function iniciarMapa() {
  const contenedor = $("#mapa");
  if (!window.L) {
    contenedor.innerHTML = '<p class="estado estado--error" role="alert">El mapa no se pudo cargar. La tabla de comparación tiene la misma información.</p>';
    return;
  }
  tablero.mapa = L.map(contenedor, { scrollWheelZoom: false, keyboard: true, zoomSnap: 0.5, zoomControl: false }).setView([5.6, -73.4], 6);
  L.control.zoom({ zoomInTitle: "Acercar el mapa", zoomOutTitle: "Alejar el mapa" }).addTo(tablero.mapa);
  const teselas = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    minZoom: 5,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
  teselas.on("tileerror", () => {
    tablero.erroresTeselas += 1;
    if (tablero.erroresTeselas === 4) {
      $("#mapa-nota").textContent = "El fondo del mapa no cargó, probablemente por la conexión. Las rutas, el gráfico y la tabla siguen funcionando.";
    }
  });
  teselas.addTo(tablero.mapa);
  tablero.capa = L.layerGroup().addTo(tablero.mapa);
  const origen = tablero.datos.origen.ubicacion.coordinates;
  L.circleMarker([origen[1], origen[0]], { radius: 9, color: "#17231d", weight: 3, fillColor: "#ffffff", fillOpacity: 1 })
    .bindTooltip("Origen: Yopal", { direction: "top" })
    .addTo(tablero.mapa);
  sacarRutasDelTab();
}

function colorRuta(r) {
  if (r.destino_id === tablero.seleccionado && r.posicion !== 1) return { color: "#1f5c45", weight: 5, opacity: 1 };
  if (r.posicion === 1) return { color: "#e3b23c", weight: 6, opacity: 1 };
  return { color: "#7d8f84", weight: 3, opacity: 0.85 };
}

function pintarMapa(visibles) {
  if (!tablero.mapa) return;
  tablero.capa.clearLayers();
  tablero.capasPorDestino.clear();
  const limites = L.latLngBounds([]);
  // Se dibujan primero las rutas comunes y al final la mejor, para que quede encima.
  [...visibles].reverse().forEach((r) => {
    const d = destinoDe(r.destino_id);
    const ruta = rutaDe(r.destino_id);
    const puntos = ruta.geometria.coordinates.map(([lon, lat]) => [lat, lon]);
    const contorno = L.polyline(puntos, { color: "#17231d", weight: 9, opacity: r.posicion === 1 ? 0.55 : 0, interactive: false });
    const linea = L.polyline(puntos, colorRuta(r));
    const [lon, lat] = d.ubicacion.coordinates;
    const marcador = L.circleMarker([lat, lon], {
      radius: r.posicion === 1 ? 9 : 7, color: "#17231d", weight: 2,
      fillColor: r.posicion === 1 ? "#e3b23c" : "#ffffff", fillOpacity: 1,
    });
    const texto = `<strong>${escapar(d.nombre)}</strong><br>${fmt.km(r.distancia_km)}, utilidad ${fmt.millones(r.utilidad_neta_cop)}`;
    marcador.bindTooltip(texto, { direction: "top" });
    linea.bindTooltip(texto, { sticky: true });
    [linea, marcador].forEach((capa) => capa.on("click", () => seleccionar(r.destino_id, false)));
    tablero.capa.addLayer(contorno);
    tablero.capa.addLayer(linea);
    tablero.capa.addLayer(marcador);
    tablero.capasPorDestino.set(r.destino_id, { linea, marcador, r });
    puntos.forEach((p) => limites.extend(p));
  });
  if (limites.isValid()) tablero.mapa.fitBounds(limites, { padding: [24, 24], maxZoom: 9 });
  sacarRutasDelTab();
}

/* Las rutas del mapa no entran en el orden de tabulación: con teclado se
   seleccionan desde el gráfico o la tabla, que tienen la misma información. */
function sacarRutasDelTab() {
  $$("#mapa .leaflet-overlay-pane path").forEach((p) => {
    p.setAttribute("tabindex", "-1");
    p.setAttribute("focusable", "false");
    p.setAttribute("aria-hidden", "true");
  });
}

function seleccionar(destinoId, moverMapa) {
  tablero.seleccionado = destinoId;
  marcarSeleccion(moverMapa);
}

function marcarSeleccion(moverMapa) {
  const id = tablero.seleccionado;
  $$("#tabla-cuerpo tr").forEach((tr) => tr.classList.toggle("es-seleccionado", tr.dataset.destino === id));
  $$("#tabla-cuerpo button, #grafico .barra-fila").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.destino === id)));

  if (tablero.mapa) {
    tablero.capasPorDestino.forEach(({ linea, r }) => linea.setStyle(colorRuta(r)));
    const sel = tablero.capasPorDestino.get(id);
    if (sel) {
      sel.linea.bringToFront();
      sel.marcador.bringToFront();
      if (moverMapa) tablero.mapa.fitBounds(sel.linea.getBounds(), { padding: [40, 40], maxZoom: 9 });
    }
  }
  const r = tablero.visibles.find((x) => x.destino_id === id);
  if (r) {
    const d = destinoDe(id);
    $("#mapa-nota").setAttribute("role", "status");
    $("#mapa-nota").textContent =
      `Seleccionado: ${d.nombre}. ${fmt.km(r.distancia_km)}, unas ${fmt.horas(r.tiempo_horas)} de viaje, utilidad ${fmt.millones(r.utilidad_neta_cop)}.`;
  }
}

/* ------------------------------------------------------------------ */
/* Pantalla de formulario: registrar lote                              */
/* ------------------------------------------------------------------ */

const formulario = { datos: null, intentoEnvio: false };

const REGLAS = {
  productor_id: (v) => (!v ? "Seleccione quién es el productor responsable del lote." : ""),
  nombre: (v) => {
    if (!v.trim()) return "Escriba un nombre para el lote.";
    if (v.trim().length < 3) return "El nombre del lote debe tener al menos 3 letras.";
    return "";
  },
  categoria: (v, form) => {
    if (!v) return "Seleccione la categoría de los animales.";
    const marcados = $$('#lista-destinos input:checked', form).map((c) => c.value);
    const conPrecio = marcados.filter((id) => precioVigente(formulario.datos, id, v));
    if (marcados.length && conPrecio.length < 2) {
      return `Todavía no hay precios de ${CATEGORIAS[v][0]} en los destinos marcados. Por ahora hay precios de novillo gordo y vaca gorda.`;
    }
    return "";
  },
  cantidad_animales: (v) => {
    if (v === "") return "Escriba cuántos animales tiene el lote.";
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 200) return "La cantidad debe ser un número entero entre 1 y 200.";
    return "";
  },
  peso_promedio_kg: (v) => {
    if (v === "") return "Escriba el peso promedio por animal, en kilogramos.";
    const n = Number(v);
    if (Number.isNaN(n) || n < 80 || n > 900) return "El peso promedio debe estar entre 80 y 900 kg.";
    return "";
  },
  municipio_origen: (v) => (!v ? "Seleccione el municipio de donde sale el lote." : ""),
  flete_km_cop: (v) => {
    if (v === "") return "Escriba el valor del flete por kilómetro.";
    const n = Number(v);
    if (Number.isNaN(n) || n < 1000 || n > 50000) return "El flete debe estar entre 1.000 y 50.000 pesos por kilómetro.";
    return "";
  },
  destino_ids: (_, form) => ($$('#lista-destinos input:checked', form).length < 2 ? "Marque al menos dos destinos para poder comparar." : ""),
};

const ETIQUETAS = {
  productor_id: "Productor responsable", nombre: "Nombre del lote", categoria: "Categoría",
  cantidad_animales: "Cantidad de animales", peso_promedio_kg: "Peso promedio por animal",
  municipio_origen: "Municipio de origen", flete_km_cop: "Valor del flete por kilómetro", destino_ids: "Destinos a comparar",
};

async function iniciarFormulario() {
  const form = $("#form-lote");
  const lista = $("#lista-destinos");
  const boton = $('#form-lote button[type="submit"]');
  lista.innerHTML = '<p class="ayuda" role="status"><span class="girador" aria-hidden="true" style="display:inline-block;vertical-align:middle"></span> Cargando productores y destinos…</p>';
  boton.disabled = true;

  try {
    formulario.datos = await cargarDatos();
  } catch (e) {
    lista.innerHTML = `<div class="estado estado--error" role="alert">
      <p><strong>No se pudo cargar la lista de destinos.</strong> ${escapar(e.message)}</p>
      <p>Lo que ya escribió sigue en el formulario.</p>
      <button type="button" class="boton" id="btn-reintentar-form">Volver a intentar</button></div>`;
    $("#btn-reintentar-form").addEventListener("click", () => {
      if (DEMO) window.location.href = "detalle.html"; else iniciarFormulario();
    });
    return;
  }
  const datos = formulario.datos;
  boton.disabled = false;

  const selProd = $("#productor_id");
  selProd.length = 1;
  datos.productores.forEach((p) => selProd.add(new Option(`${p.nombre_completo} (${p.municipio})`, p.id)));

  lista.innerHTML = datos.destinos.filter((d) => d.activo).map((d) => {
    const ruta = datos.rutas.find((r) => r.destino_id === d.id);
    return `<label class="opcion"><input type="checkbox" name="destino_ids" value="${d.id}" checked>
      <span>${escapar(d.nombre)} <small>(${escapar(d.municipio)}, ${fmt.km(ruta.distancia_km)})</small></span></label>`;
  }).join("");

  precargarFormulario(form, datos);
  actualizarPesoTotal();

  ["cantidad_animales", "peso_promedio_kg"].forEach((id) => $("#" + id).addEventListener("input", actualizarPesoTotal));

  Object.keys(REGLAS).forEach((campo) => {
    const el = campo === "destino_ids" ? lista : $("#" + campo);
    const evento = el.tagName === "SELECT" || campo === "destino_ids" ? "change" : "blur";
    el.addEventListener(evento, () => {
      if (formulario.intentoEnvio || (el.value && el.value !== "")) validarCampo(campo, form);
    });
  });

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    formulario.intentoEnvio = true;
    const errores = Object.keys(REGLAS).map((c) => [c, validarCampo(c, form)]).filter(([, m]) => m);
    const resumen = $("#resumen-errores");
    if (errores.length) {
      $("#lista-errores").innerHTML = errores
        .map(([c, m]) => `<li><a href="#${c}">${ETIQUETAS[c]}: ${escapar(m)}</a></li>`).join("");
      resumen.hidden = false;
      $$("#lista-errores a").forEach((a) => a.addEventListener("click", (e) => {
        e.preventDefault();
        const destino = document.getElementById(a.getAttribute("href").slice(1));
        const enfocable = destino.id === "destino_ids" ? $("#lista-destinos input") : destino;
        enfocable.focus();
      }));
      resumen.focus();
      return;
    }
    resumen.hidden = true;
    guardarYSimular(form);
  });
}

function precargarFormulario(form, datos) {
  let lote = null;
  let flete = datos.flete_km_cop_por_defecto;
  let destinos = null;
  if (params.get("lote") === "local") {
    const local = leerLoteLocal();
    if (local) { lote = local; flete = local.flete_km_cop; destinos = local.destino_ids; }
  } else if (params.get("lote")) {
    lote = datos.lotes.find((l) => l.id === params.get("lote"));
  }
  $("#flete_km_cop").value = flete;
  if (!lote) return;
  ["productor_id", "nombre", "categoria", "raza", "cantidad_animales", "peso_promedio_kg", "finca", "municipio_origen"]
    .forEach((c) => { if (lote[c] !== undefined && lote[c] !== null) form.elements[c].value = lote[c]; });
  if (destinos) $$("#lista-destinos input").forEach((c) => { c.checked = destinos.includes(c.value); });
  $("h1").textContent = "Editar lote y volver a comparar";
}

function actualizarPesoTotal() {
  const n = Number($("#cantidad_animales").value);
  const p = Number($("#peso_promedio_kg").value);
  $("#peso_total_kg").textContent = n > 0 && p > 0 ? fmt.kg(Math.round(n * p * 10) / 10) : "—";
}

function validarCampo(campo, form) {
  const el = campo === "destino_ids" ? null : $("#" + campo);
  const valor = el ? el.value : null;
  const mensaje = REGLAS[campo](valor, form);
  const salida = $("#" + campo + "-error");
  salida.textContent = mensaje;
  if (el) el.setAttribute("aria-invalid", mensaje ? "true" : "false");
  return mensaje;
}

function guardarYSimular(form) {
  const f = form.elements;
  const lote = {
    id: null,
    productor_id: f.productor_id.value,
    nombre: f.nombre.value.trim(),
    cantidad_animales: Number(f.cantidad_animales.value),
    peso_promedio_kg: Number(f.peso_promedio_kg.value),
    categoria: f.categoria.value,
    raza: f.raza.value.trim() || null,
    finca: f.finca.value.trim() || null,
    municipio_origen: f.municipio_origen.value,
    estado: "disponible",
    flete_km_cop: Number(f.flete_km_cop.value),
    destino_ids: $$("#lista-destinos input:checked").map((c) => c.value),
  };
  try {
    window.localStorage.setItem(CLAVE_LOTE, JSON.stringify(lote));
    window.location.href = "index.html?lote=local";
  } catch (e) {
    // Navegador sin almacenamiento: se abre el tablero con el lote de ejemplo y el flete escrito.
    window.location.href = `index.html?flete=${lote.flete_km_cop}`;
  }
}

/* ------------------------------------------------------------------ */
/* Pantalla de historial                                               */
/* ------------------------------------------------------------------ */

const historial = { datos: null };

async function iniciarHistorial() {
  mostrarEstado("cargando");
  $("#estado-vacio").hidden = true;
  try {
    historial.datos = await cargarDatos();
  } catch (e) {
    mostrarEstado("error");
    return;
  }
  if (DEMO === "vacio") historial.datos.simulaciones = [];
  const datos = historial.datos;

  const sel = $("#filtro-mejor");
  sel.length = 1;
  const usados = [...new Set(datos.simulaciones.map((s) => s.mejor_destino_id))];
  usados.forEach((id) => sel.add(new Option(datos.destinos.find((d) => d.id === id).nombre, id)));

  $("#buscar").addEventListener("input", renderHistorial);
  sel.addEventListener("change", renderHistorial);
  $("#btn-limpiar").addEventListener("click", () => { $("#buscar").value = ""; sel.value = ""; renderHistorial(); $("#buscar").focus(); });
  renderHistorial();
}

function renderHistorial() {
  const { datos } = historial;
  const texto = $("#buscar").value.trim().toLowerCase();
  const mejor = $("#filtro-mejor").value;
  const destino = (id) => datos.destinos.find((d) => d.id === id);

  const filas = datos.simulaciones.filter((s) => {
    const lote = datos.lotes.find((l) => l.id === s.lote_id);
    const prod = datos.productores.find((p) => p.id === lote.productor_id);
    const donde = `${lote.nombre} ${lote.finca || ""} ${lote.municipio_origen} ${prod.nombre_completo}`.toLowerCase();
    return (!texto || donde.includes(texto)) && (!mejor || s.mejor_destino_id === mejor);
  });

  const sinNada = datos.simulaciones.length === 0;
  mostrarEstado(filas.length ? "datos" : "ninguno");
  $("#estado-vacio").hidden = filas.length > 0;
  if (!filas.length) {
    $("#t-vacio").textContent = sinNada ? "Todavía no hay simulaciones guardadas" : "No hay simulaciones que coincidan";
    $("#vacio-texto").textContent = sinNada
      ? "Registre un lote y compare destinos: cada cálculo queda guardado aquí para revisarlo después."
      : "Pruebe con otra palabra o quite el filtro de mejor destino.";
    $("#btn-limpiar").hidden = sinNada;
    return;
  }

  $("#conteo").textContent = `${filas.length} ${filas.length === 1 ? "simulación" : "simulaciones"}, de la más reciente a la más antigua.`;
  $("#lista-simulaciones").innerHTML = filas.map((s) => {
    const lote = datos.lotes.find((l) => l.id === s.lote_id);
    const prod = datos.productores.find((p) => p.id === lote.productor_id);
    const r1 = s.resultados.find((r) => r.posicion === 1);
    const dMejor = destino(s.mejor_destino_id);
    const filasDetalle = [...s.resultados].sort((a, b) => a.posicion - b.posicion).map((r) => `
      <tr class="${r.posicion === 1 ? "es-mejor" : ""}">
        <th scope="row">${escapar(destino(r.destino_id).nombre)}${r.posicion === 1 ? ' <span class="etiqueta">Mejor</span>' : ""}</th>
        <td>${fmt.km(r.distancia_km)}</td>
        <td>${fmt.cop(r.precio_kg_cop)}</td>
        <td>${fmt.cop(r.costo_logistico_cop)}</td>
        <td><strong>${fmt.cop(r.utilidad_neta_cop)}</strong></td>
      </tr>`).join("");
    return `<li>
      <details class="simulacion">
        <summary>
          <span class="sim-fecha"><time datetime="${s.creado_en}">${fmt.fecha(s.creado_en)}</time></span>
          <span class="sim-lote"><strong>${escapar(lote.nombre)}</strong>
            <span>${animales(lote.cantidad_animales, lote.categoria)}, ${fmt.kg(lote.cantidad_animales * lote.peso_promedio_kg)}. ${escapar(prod.nombre_completo)}</span></span>
          <span class="sim-mejor"><span>Mejor destino</span><strong>${escapar(dMejor.nombre)}</strong>
            <span>${fmt.millones(r1.utilidad_neta_cop)}</span></span>
        </summary>
        <div class="simulacion__detalle">
          <p>Calculada el ${fmt.fechaHora(s.creado_en)} con flete de ${fmt.cop(s.flete_km_cop)} por km, para ${s.resultados.length} destinos. ${escapar(lote.finca || "")}${lote.finca ? ", " : ""}${escapar(lote.municipio_origen)}.</p>
          <div class="tabla-envoltura" tabindex="0" role="region" aria-label="Resultados de la simulación del ${fmt.fecha(s.creado_en)}">
            <table>
              <caption>Resultados por destino</caption>
              <thead><tr><th scope="col">Destino</th><th scope="col">Distancia</th><th scope="col">Precio por kg</th><th scope="col">Flete y peajes</th><th scope="col">Utilidad neta</th></tr></thead>
              <tbody>${filasDetalle}</tbody>
            </table>
          </div>
          <div class="acciones">
            <a class="boton" href="index.html?simulacion=${encodeURIComponent(s.id)}">Abrir en el tablero</a>
            <a class="boton boton--secundario" href="detalle.html?lote=${encodeURIComponent(lote.id)}">Editar el lote</a>
          </div>
        </div>
      </details>
    </li>`;
  }).join("");
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
  const pagina = document.body.dataset.pagina;
  if (pagina === "tablero") {
    iniciarTablero();
    $("#btn-reintentar")?.addEventListener("click", () => {
      if (DEMO) window.location.href = "index.html"; else iniciarTablero();
    });
  } else if (pagina === "formulario") {
    iniciarFormulario();
  } else if (pagina === "historial") {
    iniciarHistorial();
    $("#btn-reintentar")?.addEventListener("click", () => {
      if (DEMO) window.location.href = "historial.html"; else iniciarHistorial();
    });
  }
});
