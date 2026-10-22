/* Simulador de Destinos Ganaderos · interfaz conectada a la API (Entrega 3)
 *
 * Un solo archivo para las cinco pantallas; cada página se identifica con
 * <body data-pagina="...">: ingreso, tablero, formulario, historial, precios.
 * Todos los datos vienen de la API (js/api.js). El navegador no calcula utilidades:
 * las calcula y guarda el servidor en POST /simulaciones.
 *
 * Estados de demostración: agregar ?demo=cargando | ?demo=vacio | ?demo=error a la URL.
 */
"use strict";

const params = new URLSearchParams(window.location.search);
const DEMO = params.get("demo");

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const numero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fechaCorta = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" });
const fechaLarga = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });

const fmt = {
  cop: (v) => pesos.format(v).replace(/ /g, " "),
  millones: (v) => {
    const signo = v < 0 ? "−" : "";
    const valor = numero.format(Math.abs(v) / 1e6);
    return `${signo}$${valor} ${valor === "1" ? "millón" : "millones"}`;
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
  dia: (aaaammdd) => fechaCorta.format(new Date(`${aaaammdd}T12:00:00-05:00`)),
  fechaHora: (iso) => fechaLarga.format(new Date(iso)),
  arroba: (precioKg) => `${pesos.format(Math.round(precioKg * KG_POR_ARROBA)).replace(/\u00a0/g, " ")}/@`,
};

const CATEGORIAS = {
  novillo_gordo: ["novillo gordo", "novillos gordos"],
  vaca_gorda: ["vaca gorda", "vacas gordas"],
  novillo_levante: ["novillo de levante", "novillos de levante"],
  ternero_destete: ["ternero de destete", "terneros de destete"],
  toro: ["toro", "toros"],
};
const TIPOS = { finca: "Venta en finca", subasta: "Subasta", feria: "Feria", frigorifico: "Frigorífico", planta_beneficio: "Planta de beneficio" };
const DIAS_ADVERTENCIA = 7;
const KG_POR_ARROBA = 12.5;          // En los Llanos el ganado se negocia también por arroba (@).
const ORIGEN_YOPAL = "Yopal (centro de acopio)";
const DIAS_MAXIMO = 30;

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
const porId = (lista) => new Map(lista.map((x) => [x.id, x]));

function mostrarEstado(nombre) {
  // nombre: "cargando" | "error" | "datos" | otro (todo oculto)
  const cargando = $("#estado-cargando");
  const error = $("#estado-error");
  const datos = $("#con-datos");
  if (cargando) { cargando.hidden = nombre !== "cargando"; cargando.setAttribute("aria-busy", String(nombre === "cargando")); }
  if (error) error.hidden = nombre !== "error";
  if (datos) datos.hidden = nombre !== "datos";
}

function mostrarError(e) {
  const detalle = $("#error-detalle");
  if (detalle) detalle.textContent = e.message;
  mostrarEstado("error");
  $("#estado-error h1, #estado-error h2")?.setAttribute("tabindex", "-1");
  $("#estado-error h1, #estado-error h2")?.focus();
}

/** Envuelve la carga de una página para poder demostrar los estados con ?demo=. */
async function cargar(fn) {
  if (DEMO === "cargando") return new Promise(() => {});
  if (DEMO === "error") {
    await espera(800);
    throw new Api.ErrorApi(503, { codigo: "SERVICIO_EXTERNO_NO_DISPONIBLE", mensaje: "El servidor respondió con el código 503 (servicio no disponible)." });
  }
  return fn();
}

/** Las páginas privadas exigen sesión (salvo en modo demostración, que es solo lectura). */
function exigirSesion() {
  if (Api.modoDemo() || Api.sesion() || DEMO) return true;
  Api.irAIngreso("sesion");
  return false;
}
const esAdmin = () => Api.sesion()?.usuario.rol === "administrador";

/** Bloque de sesión en la cabecera: nombre del usuario y «Salir». */
function pintarSesion() {
  const caja = $("#sesion");
  if (!caja) return;
  const s = Api.sesion();
  if (Api.modoDemo()) {
    caja.innerHTML = '<span>Modo demostración</span> <a class="boton boton--peq" href="ingreso.html">Conectar</a>';
  } else if (s) {
    const rol = s.usuario.rol === "administrador" ? " (administrador)" : "";
    caja.innerHTML = `<span>${escapar(s.usuario.nombre_completo)}${rol}</span> <button type="button" class="boton boton--peq" id="btn-salir">Salir</button>`;
    $("#btn-salir").addEventListener("click", () => {
      Api.cerrarSesion();
      window.location.href = "ingreso.html?motivo=salida";
    });
  } else {
    caja.innerHTML = '<a class="boton boton--peq" href="ingreso.html">Ingresar</a>';
  }
  if (Api.modoDemo() && !$("#aviso-demo")) {
    const aviso = document.createElement("div");
    aviso.id = "aviso-demo";
    aviso.className = "aviso";
    aviso.setAttribute("role", "note");
    aviso.innerHTML = `<p><strong>Versión de demostración, sin servidor.</strong> Muestra datos de ejemplo y no guarda cambios.
      Para usar la aplicación de verdad, encienda la API y <a href="ingreso.html">escriba su dirección</a>.</p>`;
    $("main")?.prepend(aviso);
  }
}

/** Trae todas las páginas de una lista paginada (por_pagina máximo 100). */
async function todos(ruta, op) {
  const sep = ruta.includes("?") ? "&" : "?";
  const primera = await Api.get(`${ruta}${sep}por_pagina=100&pagina=1`, op);
  let datos = primera.datos;
  const paginas = Math.ceil(primera.total / 100);
  for (let p = 2; p <= paginas; p += 1) {
    datos = datos.concat((await Api.get(`${ruta}${sep}por_pagina=100&pagina=${p}`, op)).datos);
  }
  return datos;
}

/** Destinos activos más los inactivos que aparezcan en resultados viejos. */
async function destinosCon(ids) {
  const activos = await todos("/destinos");
  const mapa = porId(activos);
  const faltan = [...new Set(ids)].filter((id) => !mapa.has(id));
  const extra = await Promise.all(faltan.map((id) => Api.get(`/destinos/${id}`).catch(() => null)));
  extra.filter(Boolean).forEach((d) => mapa.set(d.id, d));
  return mapa;
}

/* ------------------------------------------------------------------ */
/* Pantalla de ingreso                                                 */
/* ------------------------------------------------------------------ */

function destinoSeguro(texto) {
  // Solo se vuelve a páginas de esta misma aplicación.
  return /^[a-z]+\.html(\?[^:]*)?$/i.test(texto || "") && !/^ingreso\.html/i.test(texto) ? texto : "index.html";
}

function iniciarIngreso() {
  const aviso = $("#aviso-ingreso");
  const avisar = (html) => { aviso.innerHTML = `<p>${html}</p>`; aviso.hidden = false; };
  const motivos = {
    sesion: "Inicie sesión para continuar.",
    vencida: "Su sesión venció. Vuelva a ingresar; lo que tenía guardado sigue en el servidor.",
    salida: "Cerró la sesión.",
    suspendida: "Su cuenta está suspendida. Comuníquese con el administrador.",
  };
  if (motivos[params.get("motivo")]) avisar(motivos[params.get("motivo")]);
  const s = Api.sesion();
  if (s && !params.get("motivo")) {
    avisar(`Ya inició sesión como <strong>${escapar(s.usuario.nombre_completo)}</strong>. <a href="index.html">Ir al tablero</a>.`);
  }

  // Conexión con el servidor
  const actual = $("#api-actual");
  const detalles = $(".conexion");
  const pintarBase = () => { actual.textContent = Api.base() || "ninguna (modo demostración)"; };
  pintarBase();
  $("#api-base").value = Api.base() || "";
  if (Api.modoDemo()) {
    detalles.open = true;
    avisar("Esta copia del tablero no sabe dónde está la API. Escriba su dirección en «Conexión con el servidor», al final de la página.");
  }
  $("#form-api").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const texto = $("#api-base").value.trim();
    const n = Api.guardarBase(texto);
    if (texto && !n) { avisar("La dirección no es válida. Debe empezar por http:// o https://."); return; }
    pintarBase();
    try {
      const salud = await Api.salud();
      avisar(`Conectado con la API ${escapar(salud.version)} en ${escapar(Api.base())}. Ya puede ingresar.`);
    } catch (e) {
      avisar(`Se guardó la dirección, pero la API no respondió: ${escapar(e.message)}`);
    }
  });

  // Inicio de sesión
  const formIngreso = $("#form-ingreso");
  const errIngreso = $("#errores-ingreso");
  formIngreso.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const correo = $("#ingreso-correo").value.trim();
    const contrasena = $("#ingreso-contrasena").value;
    const faltan = [];
    if (!correo) faltan.push("Escriba su correo.");
    if (!contrasena) faltan.push("Escriba su contraseña.");
    if (faltan.length) { mostrarResumen(errIngreso, faltan); return; }
    const boton = formIngreso.querySelector("button");
    boton.disabled = true;
    try {
      await Api.ingresar(correo, contrasena);
      window.location.href = destinoSeguro(params.get("volver"));
    } catch (e) {
      mostrarResumen(errIngreso, [e.codigo === "VALIDACION_FALLIDA" ? "Revise que el correo esté bien escrito." : e.message]);
      boton.disabled = false;
    }
  });

  // El registro (persona o empresa) está en js/cuentas.js: conectarRegistro().
}

function mostrarResumen(caja, mensajes, titulo = "Revise lo siguiente") {
  caja.innerHTML = `<h3>${escapar(titulo)}</h3><ul>${mensajes.map((m) => `<li>${escapar(m)}</li>`).join("")}</ul>`;
  caja.hidden = false;
  caja.focus();
}

/* ------------------------------------------------------------------ */
/* Pantalla principal: tablero                                         */
/* ------------------------------------------------------------------ */

const tablero = {
  simulacion: null,
  lote: null,
  destinos: new Map(),
  rutas: new Map(),
  visibles: [],
  seleccionado: null,
  mapa: null,
  capa: null,
  capasPorDestino: new Map(),
  erroresTeselas: 0,
  conectado: false,
};

async function iniciarTablero() {
  if (!exigirSesion()) return;
  mostrarEstado("cargando");
  $("#estado-sin-simulaciones").hidden = true;
  let datos;
  try {
    datos = await cargar(async () => {
      const id = params.get("simulacion");
      let sim;
      if (id) sim = await Api.get(`/simulaciones/${encodeURIComponent(id)}`);
      else sim = (await Api.get("/simulaciones?por_pagina=1")).datos[0] || null;
      if (!sim) return { sim: null };
      const [lote, destinos, rutas] = await Promise.all([
        Api.get(`/lotes/${sim.lote_id}`),
        destinosCon(sim.resultados.map((r) => r.destino_id)),
        Api.get("/rutas"),
      ]);
      return { sim, lote, destinos, rutas };
    });
  } catch (e) {
    mostrarError(e);
    return;
  }
  if (!datos.sim) {
    mostrarEstado("ninguno");
    $("#estado-sin-simulaciones").hidden = false;
    return;
  }
  tablero.simulacion = datos.sim;
  tablero.lote = datos.lote;
  tablero.destinos = datos.destinos;
  tablero.rutas = new Map(datos.rutas.map((r) => [r.id, r]));
  mostrarEstado("datos");
  pintarEncabezadoLote();
  const rutaOrigen = tablero.rutas.get(datos.sim.resultados.find((r) => r.distancia_km > 0)?.ruta_id || datos.sim.resultados[0]?.ruta_id);
  tablero.origen = rutaOrigen;
  iniciarMapa(rutaOrigen);
  if (!tablero.conectado) conectarFiltros();
  if (DEMO === "vacio") {
    // Estado vacío con un caso real: solo plantas de beneficio a menos de 100 km.
    $$("#filtro-tipos input").forEach((c) => { c.checked = c.value === "planta_beneficio"; });
    $("#filtro-distancia").value = 100;
  }
  renderTablero();
}

function pintarEncabezadoLote() {
  const { lote, simulacion: sim } = tablero;
  const finca = lote.finca ? `, ${lote.finca} (${lote.municipio_origen})` : `, ${lote.municipio_origen}`;
  const camiones = sim.resultados[0]?.camiones;
  $("#lote-resumen").innerHTML =
    `Lote: <strong>${escapar(lote.nombre)}</strong>. ${animales(lote.cantidad_animales, lote.categoria)}, ${fmt.kg(lote.peso_total_kg)}${escapar(finca)}. ` +
    `Flete de ${fmt.cop(sim.flete_km_cop)} por km${camiones ? `, ${camiones} ${camiones === 1 ? "camión" : "camiones"} de ${sim.capacidad_camion} animales` : ""}` +
    `${sim.flete_incluye_peajes ? ", peajes incluidos en el flete" : ""}.`;
  $("#enlace-editar-lote").href = `detalle.html?lote=${encodeURIComponent(lote.id)}&simulacion=${encodeURIComponent(sim.id)}`;

  const avisos = [];
  avisos.push(`<p>Calculado por el servidor el <strong>${fmt.fechaHora(sim.creado_en)}</strong> con los precios vigentes ese día.
    <button type="button" class="boton boton--secundario boton--peq" id="btn-recalcular">Recalcular con los precios de hoy</button></p>`);
  const viejos = sim.resultados.filter((r) => r.advertencia);
  if (viejos.length) {
    avisos.push(`<p><strong>Atención:</strong> ${viejos.length === 1 ? "un destino usa" : `${viejos.length} destinos usan`} un precio con más de ${DIAS_ADVERTENCIA} días
      (${viejos.map((r) => escapar(tablero.destinos.get(r.destino_id)?.nombre)).join(", ")}). Revise la columna «Precio por kg».</p>`);
  }
  const rutasUsadas = sim.resultados.map((r) => tablero.rutas.get(r.ruta_id)).filter(Boolean);
  const origenNombre = tablero.origen?.origen_nombre || lote.municipio_origen;
  if (rutasUsadas.some((r) => r.fuente === "respaldo_linea_recta")) {
    avisos.push(`<p><strong>Distancias estimadas desde ${escapar(origenNombre)}:</strong> se calcularon en línea recta ajustada por la forma de la vía,
      con la merma y los peajes de rutas parecidas. Si conoce la distancia real, tómela como referencia.</p>`);
  } else if (rutasUsadas.some((r) => r.fuente === "osrm")) {
    avisos.push(`<p>Distancias por carretera desde ${escapar(origenNombre)}, medidas con OpenStreetMap (OSRM).</p>`);
  }
  const aviso = $("#aviso-simulacion");
  aviso.innerHTML = avisos.join("");
  aviso.hidden = false;
  $("#btn-recalcular").addEventListener("click", recalcular);
}

async function recalcular() {
  const boton = $("#btn-recalcular");
  const sim = tablero.simulacion;
  boton.disabled = true;
  boton.textContent = "Calculando…";
  try {
    const nueva = await Api.post("/simulaciones", {
      lote_id: sim.lote_id,
      flete_km_cop: sim.flete_km_cop,
      capacidad_camion: sim.capacidad_camion,
      flete_incluye_peajes: sim.flete_incluye_peajes,
      destino_ids: sim.resultados.map((r) => r.destino_id),
    });
    window.location.href = `index.html?simulacion=${encodeURIComponent(nueva.id)}`;
  } catch (e) {
    const extra = e.detalles.map((d) => escapar(d.problema)).join(" ");
    $("#aviso-simulacion").insertAdjacentHTML("beforeend", `<p role="alert"><strong>No se pudo recalcular:</strong> ${escapar(e.message)} ${extra}</p>`);
    boton.disabled = false;
    boton.textContent = "Recalcular con los precios de hoy";
  }
}

function conectarFiltros() {
  tablero.conectado = true;
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

const destinoDe = (id) => tablero.destinos.get(id) || { nombre: "Destino retirado", tipo: "finca", municipio: "", ubicacion: null };

function ordenar(resultados) {
  resultados.sort((a, b) => b.utilidad_neta_cop - a.utilidad_neta_cop || a.distancia_km - b.distancia_km);
  resultados.forEach((r, i) => { r.posicion = i + 1; });
  return resultados;
}

function renderTablero() {
  const tipos = $$("#filtro-tipos input:checked").map((c) => c.value);
  const maxKm = Number($("#filtro-distancia").value);
  $("#filtro-distancia-valor").textContent = `Hasta ${maxKm} km`;

  const visibles = tablero.simulacion.resultados
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
  $("#t-respuesta").textContent = d.tipo === "finca" ? "Véndalo en la finca" : `Llévelo a ${d.nombre}, en ${d.municipio}`;

  let texto = mejor.costo_logistico_cop > 0
    ? `Le quedan <strong>${fmt.millones(mejor.utilidad_neta_cop)}</strong> después de pagar ${fmt.millones(mejor.costo_logistico_cop)} de flete, peajes y comisión.`
    : `Le quedan <strong>${fmt.millones(mejor.utilidad_neta_cop)}</strong>, sin pagar flete ni comisión: el comprador recoge el ganado.`;
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
    destinoDe(base.destino_id).tipo === "finca"
      ? "Cada barra es la diferencia de utilidad frente a vender en la propia finca."
      : `Cada barra es la diferencia de utilidad frente a vender en ${destinoDe(base.destino_id).nombre} (${fmt.km(base.distancia_km)}), el destino más cercano.`;

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

function celdaPrecio(r) {
  const fecha = r.precio_fecha ? `<small class="dato-fecha">${fmt.dia(r.precio_fecha)}</small>` : "";
  const aviso = r.advertencia ? `<small class="advertencia">${escapar(r.advertencia)}</small>` : "";
  return `${fmt.cop(r.precio_kg_cop)}<small class="dato-fecha">≈ ${fmt.arroba(r.precio_kg_cop)}</small>${fecha}${aviso}`;
}

function pintarTabla(visibles) {
  const { lote } = tablero;
  $("#tabla-caption").textContent =
    `Utilidad estimada de ${animales(lote.cantidad_animales, lote.categoria)} (${fmt.kg(lote.peso_total_kg)}) por destino`;
  $("#tabla-cuerpo").innerHTML = visibles.map((r) => {
    const d = destinoDe(r.destino_id);
    const mejor = r.posicion === 1 ? ' <span class="etiqueta">Mejor</span>' : "";
    return `<tr data-destino="${r.destino_id}" class="${r.posicion === 1 ? "es-mejor" : ""}">
      <th scope="row" class="fila-destino">${escapar(d.nombre)}${mejor}<small>${TIPOS[d.tipo] || ""}${d.municipio ? `, ${escapar(d.municipio)}` : ""}</small></th>
      <td>${fmt.km(r.distancia_km)}</td>
      <td>${fmt.horas(r.tiempo_horas)}</td>
      <td>${fmt.pct(r.merma_pct)}</td>
      <td>${celdaPrecio(r)}</td>
      <td>${fmt.cop(r.flete_cop)}</td>
      <td>${fmt.cop(r.peajes_cop)}</td>
      <td>${fmt.cop(r.comision_cop || 0)}</td>
      <td class="${r.utilidad_neta_cop < 0 ? "negativo" : ""}"><strong>${fmt.cop(r.utilidad_neta_cop)}</strong></td>
      <td><button type="button" class="boton boton--secundario boton--peq" data-destino="${r.destino_id}" aria-pressed="false">Ver en mapa<span class="sr-only">: ${escapar(d.nombre)}</span></button></td>
    </tr>`;
  }).join("");
  $$("#tabla-cuerpo button").forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); seleccionar(b.dataset.destino, true); }));
  $$("#tabla-cuerpo tr").forEach((tr) => tr.addEventListener("click", () => seleccionar(tr.dataset.destino, true)));
}

/* ---------- Mapa (Leaflet) ---------- */

function iniciarMapa(rutaEjemplo) {
  const contenedor = $("#mapa");
  if (tablero.mapa) return;
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
  const origen = rutaEjemplo?.origen?.coordinates || [-72.3959, 5.3378];
  const nombre = rutaEjemplo?.origen_nombre || ORIGEN_YOPAL;
  L.circleMarker([origen[1], origen[0]], { radius: 9, color: "#17231d", weight: 3, fillColor: "#ffffff", fillOpacity: 1 })
    .bindTooltip(`Origen: ${escapar(nombre)}`, { direction: "top" })
    .addTo(tablero.mapa);
  $("#leyenda-origen").textContent = `Origen: ${nombre}`;
  $("#t-mapa").textContent = `Rutas desde ${nombre.replace(" (centro de acopio)", "")}`;
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
    const ruta = tablero.rutas.get(r.ruta_id);
    const texto = `<strong>${escapar(d.nombre)}</strong><br>${fmt.km(r.distancia_km)}, utilidad ${fmt.millones(r.utilidad_neta_cop)}`;
    const capas = {};
    if (ruta) {
      const puntos = ruta.geometria.coordinates.map(([lon, lat]) => [lat, lon]);
      tablero.capa.addLayer(L.polyline(puntos, { color: "#17231d", weight: 9, opacity: r.posicion === 1 ? 0.55 : 0, interactive: false }));
      capas.linea = L.polyline(puntos, colorRuta(r)).bindTooltip(texto, { sticky: true });
      tablero.capa.addLayer(capas.linea);
      puntos.forEach((p) => limites.extend(p));
    }
    // La venta en finca se marca en el origen del lote, no en un punto fijo.
    const punto = d.tipo === "finca" && ruta ? ruta.origen.coordinates : d.ubicacion?.coordinates;
    if (punto) {
      const [lon, lat] = punto;
      capas.marcador = L.circleMarker([lat, lon], {
        radius: r.posicion === 1 ? 9 : 7, color: "#17231d", weight: 2,
        fillColor: r.posicion === 1 ? "#e3b23c" : "#ffffff", fillOpacity: 1,
      }).bindTooltip(texto, { direction: "top" });
      tablero.capa.addLayer(capas.marcador);
      limites.extend([lat, lon]);
    }
    [capas.linea, capas.marcador].filter(Boolean).forEach((c) => c.on("click", () => seleccionar(r.destino_id, false)));
    tablero.capasPorDestino.set(r.destino_id, { ...capas, r });
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
    tablero.capasPorDestino.forEach(({ linea, r }) => linea?.setStyle(colorRuta(r)));
    const sel = tablero.capasPorDestino.get(id);
    if (sel) {
      sel.linea?.bringToFront();
      sel.marcador?.bringToFront();
      if (moverMapa && sel.linea) tablero.mapa.fitBounds(sel.linea.getBounds(), { padding: [40, 40], maxZoom: 9 });
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
/* Pantalla de formulario: registrar lote y calcular                    */
/* ------------------------------------------------------------------ */

const formulario = { lotes: new Map(), fincas: new Map(), destinos: [], rutas: new Map(), intentoEnvio: false, listo: false };

const CAMPOS_LOTE = ["nombre", "categoria", "raza", "cantidad_animales", "peso_promedio_kg", "finca", "municipio_origen"];

const REGLAS = {
  productor_id: (v) => (esAdmin() && !$("#lote_existente").value && !v ? "Seleccione a nombre de qué productor queda el lote." : ""),
  nombre: (v) => {
    if (!v.trim()) return "Escriba un nombre para el lote.";
    if (v.trim().length < 3) return "El nombre del lote debe tener al menos 3 letras.";
    return "";
  },
  categoria: (v) => (!v ? "Seleccione la categoría de los animales." : ""),
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
    if (Math.round(n * 10) !== n * 10) return "Use máximo un decimal en el peso promedio.";
    return "";
  },
  municipio_origen: (v) => (!v ? "Seleccione el municipio de donde sale el lote." : ""),
  flete_km_cop: (v) => {
    if (v === "") return "Escriba el valor del flete por kilómetro.";
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1000 || n > 50000) return "El flete debe ser un número entero entre 1.000 y 50.000 pesos por kilómetro.";
    return "";
  },
  capacidad_camion: (v) => {
    const n = Number(v);
    if (v === "" || !Number.isInteger(n) || n < 5 || n > 40) return "Escriba cuántos animales caben en un camión (entre 5 y 40).";
    return "";
  },
  destino_ids: () => {
    const n = $$("#lista-destinos input:checked").length;
    if (n < 2) return "Marque al menos dos destinos para poder comparar.";
    if (n > 15) return "Puede comparar máximo 15 destinos a la vez.";
    return "";
  },
};

const ETIQUETAS = {
  productor_id: "Productor", nombre: "Nombre del lote", categoria: "Categoría", raza: "Raza",
  cantidad_animales: "Cantidad de animales", peso_promedio_kg: "Peso promedio por animal", finca: "Finca", finca_id: "Finca",
  municipio_origen: "Municipio de origen", flete_km_cop: "Flete por kilómetro", capacidad_camion: "Animales por camión",
  destino_ids: "Destinos a comparar", lote_id: "Lote",
};

async function iniciarFormulario() {
  if (!exigirSesion()) return;
  mostrarEstado("cargando");
  let datos;
  try {
    datos = await cargar(async () => {
      const [lotes, destinos, rutas, productores, fincas] = await Promise.all([
        todos("/lotes"),
        todos("/destinos"),
        Api.get(`/rutas?origen=${encodeURIComponent(ORIGEN_YOPAL)}`),
        esAdmin() ? todos("/productores") : Promise.resolve([]),
        Api.modoDemo() ? Promise.resolve([]) : todos("/fincas"),
      ]);
      return { lotes, destinos, rutas, productores, fincas };
    });
  } catch (e) {
    mostrarError(e);
    return;
  }
  formulario.lotes = porId(datos.lotes);
  formulario.fincas = porId(datos.fincas);
  formulario.rutas = new Map(datos.rutas.map((r) => [r.destino_id, r]));
  // Los destinos sin ruta medida (por ejemplo, uno recién creado) también se ofrecen: el servidor estima la ruta.
  const km = (d) => (d.tipo === "finca" ? 0 : formulario.rutas.get(d.id)?.distancia_km ?? Infinity);
  formulario.destinos = [...datos.destinos].sort((a, b) => km(a) - km(b));
  mostrarEstado("datos");

  if (esAdmin()) {
    $("#bloque-productor").hidden = false;
    const sel = $("#productor_id");
    sel.length = 1;
    datos.productores.forEach((p) => sel.add(new Option(`${p.nombre_completo} (${p.municipio})`, p.id)));
  }

  const selLote = $("#lote_existente");
  selLote.length = 1;
  datos.lotes.filter((l) => l.estado !== "vendido").forEach((l) =>
    selLote.add(new Option(`${l.nombre} · ${animales(l.cantidad_animales, l.categoria)}`, l.id)));

  $("#lista-destinos").innerHTML = formulario.destinos.map((d) => {
    const ruta = formulario.rutas.get(d.id);
    const comision = d.comision_pct ? `, comisión ${fmt.pct(d.comision_pct)}` : "";
    return `<label class="opcion"><input type="checkbox" name="destino_ids" value="${d.id}" checked>
      <span>${escapar(d.nombre)} <small>(${TIPOS[d.tipo]}, <span data-km="${d.id}">${d.tipo === "finca" ? "sin viaje" : (ruta ? `${fmt.km(ruta.distancia_km)} desde Yopal` : "distancia: se calcula al comparar")}</span>${comision})</small></span></label>`;
  }).join("");

  pintarFincasFormulario();
  if (!formulario.listo) conectarFormulario();
  precargarFormulario();
}

/** Lista de fincas del productor del lote (el de la sesión, o el elegido por el administrador). */
function pintarFincasFormulario(seleccionada = "") {
  const sel = $("#finca_id");
  if (!sel) return;
  const loteId = $("#lote_existente").value;
  const productor = loteId ? formulario.lotes.get(loteId)?.productor_id : (esAdmin() ? $("#productor_id").value : Api.sesion()?.usuario.productor_id);
  const fincas = [...formulario.fincas.values()].filter((f) => f.productor_id === productor && (f.activo || f.id === seleccionada));
  sel.innerHTML = `<option value="">${fincas.length ? "Otra (escribir nombre y municipio)" : "Sin fincas registradas (escribir nombre y municipio)"}</option>`
    + fincas.map((f) => `<option value="${f.id}">${escapar(f.nombre)} (${escapar(f.municipio)})${f.activo ? "" : " · inactiva"}</option>`).join("");
  sel.value = fincas.some((f) => f.id === seleccionada) ? seleccionada : (fincas.length && !loteId ? fincas[0].id : "");
  aplicarFinca();
}

/** Con una finca elegida, el municipio de origen y el nombre salen de ella. */
function aplicarFinca() {
  const finca = formulario.fincas.get($("#finca_id")?.value);
  $("#bloque-finca-texto").hidden = Boolean(finca);
  const mun = $("#municipio_origen");
  if (finca) {
    if (![...mun.options].some((o) => o.value === finca.municipio)) mun.add(new Option(finca.municipio, finca.municipio));
    mun.value = finca.municipio;
    $("#finca").value = finca.nombre;
  }
  mun.disabled = Boolean(finca);
  $("#municipio_origen-ayuda").textContent = finca
    ? `Sale de ${finca.nombre}, en ${finca.municipio}. Para cambiarlo, cambie la finca o edítela en Mi cuenta.`
    : "Las distancias, el flete y la merma se calculan desde aquí.";
  distanciasDesdeOrigen();
}

function conectarFormulario() {
  formulario.listo = true;
  const form = $("#form-lote");
  ["cantidad_animales", "peso_promedio_kg", "capacidad_camion"].forEach((id) => $("#" + id).addEventListener("input", actualizarPesoTotal));
  $("#lote_existente").addEventListener("change", (ev) => llenarLote(formulario.lotes.get(ev.target.value)));
  $("#categoria").addEventListener("change", sugerirDestinos);
  $("#municipio_origen").addEventListener("change", distanciasDesdeOrigen);
  $("#finca_id").addEventListener("change", aplicarFinca);
  $("#productor_id").addEventListener("change", () => pintarFincasFormulario());

  Object.keys(REGLAS).forEach((campo) => {
    const el = campo === "destino_ids" ? $("#lista-destinos") : $("#" + campo);
    const evento = el.tagName === "SELECT" || campo === "destino_ids" ? "change" : "blur";
    el.addEventListener(evento, () => {
      if (formulario.intentoEnvio || (el.value && el.value !== "")) validarCampo(campo);
    });
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    formulario.intentoEnvio = true;
    const errores = Object.keys(REGLAS).map((c) => [c, validarCampo(c)]).filter(([, m]) => m);
    if (errores.length) { mostrarErroresFormulario(errores); return; }
    $("#resumen-errores").hidden = true;
    await guardarYSimular();
  });
}

function precargarFormulario() {
  const id = params.get("lote");
  const lote = id ? formulario.lotes.get(id) : null;
  if (lote) {
    $("#lote_existente").value = lote.id;
    llenarLote(lote);
    $("#t-form").textContent = "Editar lote y volver a comparar";
  }
  // Si viene de una simulación, se recuperan el flete y los destinos que usó.
  const simId = params.get("simulacion");
  if (simId && !Api.modoDemo()) {
    Api.get(`/simulaciones/${encodeURIComponent(simId)}`).then((sim) => {
      $("#flete_km_cop").value = sim.flete_km_cop;
      $("#capacidad_camion").value = sim.capacidad_camion;
      $("#flete_incluye_peajes").checked = sim.flete_incluye_peajes;
      const usados = new Set(sim.resultados.map((r) => r.destino_id));
      $$("#lista-destinos input").forEach((c) => { c.checked = usados.has(c.value); });
      actualizarPesoTotal();
    }).catch(() => {});
  }
  actualizarPesoTotal();
}

/** Muestra en la lista de destinos la distancia desde el municipio elegido. */
async function distanciasDesdeOrigen() {
  const municipio = $("#municipio_origen").value;
  const nombre = !municipio || municipio === "Yopal" ? ORIGEN_YOPAL : municipio;
  let rutas = formulario.rutas;
  if (nombre !== ORIGEN_YOPAL) {
    try {
      rutas = new Map((await Api.get(`/rutas?origen=${encodeURIComponent(nombre)}`)).map((r) => [r.destino_id, r]));
    } catch (e) { rutas = new Map(); }
  }
  const desde = nombre.replace(" (centro de acopio)", "");
  $$("[data-km]").forEach((el) => {
    const d = formulario.destinos.find((x) => x.id === el.dataset.km);
    if (d?.tipo === "finca") return;
    const r = rutas.get(el.dataset.km);
    el.textContent = r ? `${fmt.km(r.distancia_km)} desde ${desde}` : `distancia desde ${desde}: se calcula al comparar`;
  });
}

function llenarLote(lote) {
  const f = $("#form-lote").elements;
  if (!lote) {
    CAMPOS_LOTE.forEach((c) => { f[c].value = ""; });
    $("#bloque-productor").hidden = !esAdmin();
  } else {
    CAMPOS_LOTE.forEach((c) => { f[c].value = lote[c] ?? ""; });
    // El productor de un lote existente no cambia.
    $("#bloque-productor").hidden = true;
  }
  pintarFincasFormulario(lote?.finca_id || "");
  sugerirDestinos();
  distanciasDesdeOrigen();
  actualizarPesoTotal();
}

/** El ganado de levante no lo compran frigoríficos ni plantas de beneficio: se desmarcan. */
function sugerirDestinos() {
  const levante = ["novillo_levante", "ternero_destete"].includes($("#categoria").value);
  $$("#lista-destinos input").forEach((c) => {
    const d = formulario.destinos.find((x) => x.id === c.value);
    const noCompra = levante && ["frigorifico", "planta_beneficio"].includes(d?.tipo);
    if (noCompra) c.checked = false;
  });
}

function actualizarPesoTotal() {
  const n = Number($("#cantidad_animales").value);
  const p = Number($("#peso_promedio_kg").value);
  const cap = Number($("#capacidad_camion").value) || 25;
  $("#peso_total_kg").textContent = n > 0 && p > 0 ? fmt.kg(Math.round(n * p * 10) / 10) : "—";
  $("#camiones").textContent = n > 0 ? String(Math.ceil(n / cap)) : "—";
}

function validarCampo(campo, mensajeServidor) {
  const el = campo === "destino_ids" ? null : $("#" + campo);
  const mensaje = mensajeServidor ?? REGLAS[campo]?.(el ? el.value : null) ?? "";
  const salida = $("#" + campo + "-error");
  if (salida) salida.textContent = mensaje;
  if (el) el.setAttribute("aria-invalid", mensaje ? "true" : "false");
  return mensaje;
}

function mostrarErroresFormulario(errores, titulo) {
  const resumen = $("#resumen-errores");
  if (titulo) $("h2", resumen).textContent = titulo;
  else $("h2", resumen).textContent = "Revise estos campos antes de calcular";
  $("#lista-errores").innerHTML = errores.map(([c, m]) => {
    const destino = document.getElementById(c) ? c : null;
    const texto = `${ETIQUETAS[c] ? `${ETIQUETAS[c]}: ` : ""}${escapar(m)}`;
    return destino ? `<li><a href="#${c}">${texto}</a></li>` : `<li>${texto}</li>`;
  }).join("");
  resumen.hidden = false;
  $$("#lista-errores a").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const destino = document.getElementById(a.getAttribute("href").slice(1));
    const enfocable = destino.id === "destino_ids" ? $("#lista-destinos input") : destino;
    enfocable?.focus();
  }));
  resumen.focus();
}

/** Convierte los `detalles` de un 422 en errores junto a cada campo. */
function erroresDelServidor(e, idsDestinos) {
  const lista = e.detalles.map((d) => {
    const m = d.campo.match(/^destino_ids\[(\d+)\]$/);
    if (m) {
      const destino = formulario.destinos.find((x) => x.id === idsDestinos?.[Number(m[1])]);
      return ["destino_ids", destino && !d.problema.includes(destino.nombre) ? `${destino.nombre}: ${d.problema}` : d.problema];
    }
    return [d.campo, d.problema];
  });
  const porCampo = new Map();
  lista.forEach(([c, m]) => porCampo.set(c, porCampo.has(c) ? `${porCampo.get(c)} ${m}` : m));
  porCampo.forEach((m, c) => validarCampo(c, m));
  return lista.length ? lista : [["", e.message]];
}

async function guardarYSimular() {
  const f = $("#form-lote").elements;
  const boton = $("#btn-calcular");
  const textoBoton = boton.textContent;
  const loteId = $("#lote_existente").value;
  const cuerpoLote = {
    nombre: f.nombre.value.trim(),
    cantidad_animales: Number(f.cantidad_animales.value),
    peso_promedio_kg: Number(f.peso_promedio_kg.value),
    categoria: f.categoria.value,
    raza: f.raza.value.trim() || null,
  };
  const fincaId = f.finca_id.value;
  if (fincaId) {
    cuerpoLote.finca_id = fincaId;
  } else {
    if (loteId) cuerpoLote.finca_id = null;
    cuerpoLote.finca = f.finca.value.trim() || null;
    cuerpoLote.municipio_origen = f.municipio_origen.value;
  }
  const destinoIds = $$("#lista-destinos input:checked").map((c) => c.value);
  boton.disabled = true;
  boton.textContent = "Guardando el lote…";

  let lote;
  try {
    if (loteId) {
      lote = await Api.patch(`/lotes/${loteId}`, cuerpoLote);
    } else {
      if (esAdmin()) cuerpoLote.productor_id = f.productor_id.value;
      lote = await Api.post("/lotes", cuerpoLote);
      // Si la simulación falla, el siguiente intento corrige este lote en vez de crear otro.
      formulario.lotes.set(lote.id, lote);
      $("#lote_existente").add(new Option(`${lote.nombre} · ${animales(lote.cantidad_animales, lote.categoria)}`, lote.id));
      $("#lote_existente").value = lote.id;
      $("#bloque-productor").hidden = true;
    }
  } catch (e) {
    mostrarErroresFormulario(erroresDelServidor(e), "El servidor no aceptó el lote");
    boton.disabled = false;
    boton.textContent = textoBoton;
    return;
  }

  boton.textContent = "Calculando en el servidor…";
  try {
    const sim = await Api.post("/simulaciones", {
      lote_id: lote.id,
      flete_km_cop: Number(f.flete_km_cop.value),
      capacidad_camion: Number(f.capacidad_camion.value),
      flete_incluye_peajes: f.flete_incluye_peajes.checked,
      destino_ids: destinoIds,
    });
    window.location.href = `index.html?simulacion=${encodeURIComponent(sim.id)}`;
  } catch (e) {
    mostrarErroresFormulario(erroresDelServidor(e, destinoIds), "El lote se guardó, pero no se pudo calcular");
    boton.disabled = false;
    boton.textContent = textoBoton;
  }
}

/* ------------------------------------------------------------------ */
/* Pantalla de historial                                               */
/* ------------------------------------------------------------------ */

const historial = { simulaciones: [], lotes: new Map(), destinos: new Map(), productores: new Map(), listo: false };

async function iniciarHistorial() {
  if (!exigirSesion()) return;
  mostrarEstado("cargando");
  $("#estado-vacio").hidden = true;
  try {
    await cargar(async () => {
      const [simulaciones, lotes, productores] = await Promise.all([
        todos("/simulaciones"),
        todos("/lotes"),
        esAdmin() || Api.modoDemo() ? todos("/productores") : Promise.resolve([]),
      ]);
      historial.simulaciones = simulaciones;
      historial.lotes = porId(lotes);
      historial.productores = porId(productores);
      historial.destinos = await destinosCon(simulaciones.flatMap((s) => s.resultados.map((r) => r.destino_id)));
    });
  } catch (e) {
    mostrarError(e);
    return;
  }
  if (DEMO === "vacio") historial.simulaciones = [];

  const sel = $("#filtro-mejor");
  sel.length = 1;
  const usados = [...new Set(historial.simulaciones.map((s) => s.mejor_destino_id))];
  usados.forEach((id) => sel.add(new Option(historial.destinos.get(id)?.nombre || "Destino retirado", id)));

  if (!historial.listo) {
    historial.listo = true;
    $("#buscar").addEventListener("input", renderHistorial);
    sel.addEventListener("change", renderHistorial);
    $("#btn-limpiar").addEventListener("click", () => { $("#buscar").value = ""; sel.value = ""; renderHistorial(); $("#buscar").focus(); });
    $("#lista-simulaciones").addEventListener("click", (ev) => {
      const boton = ev.target.closest("[data-eliminar]");
      if (boton) eliminarSimulacion(boton.dataset.eliminar, boton);
    });
  }
  // Desde «Mis lotes»: historial.html?lote=<id> muestra solo las simulaciones de ese lote.
  const loteFiltro = historial.lotes.get(params.get("lote"));
  if (loteFiltro && !$("#buscar").value) $("#buscar").value = loteFiltro.nombre;
  renderHistorial();
}

function nombreProductor(lote) {
  if (!lote) return "";
  const p = historial.productores.get(lote.productor_id);
  if (p) return p.nombre_completo;
  const s = Api.sesion();
  return s && s.usuario.productor_id === lote.productor_id ? s.usuario.nombre_completo : "";
}

async function eliminarSimulacion(id, boton) {
  if (!window.confirm("¿Eliminar esta simulación del historial? El lote no se borra.")) return;
  boton.disabled = true;
  try {
    await Api.del(`/simulaciones/${id}`);
    historial.simulaciones = historial.simulaciones.filter((s) => s.id !== id);
    renderHistorial();
    $("#conteo").textContent = `Simulación eliminada. ${$("#conteo").textContent}`;
    $("#buscar").focus();
  } catch (e) {
    boton.disabled = false;
    window.alert(`No se pudo eliminar: ${e.message}`);
  }
}

function renderHistorial() {
  const texto = $("#buscar").value.trim().toLowerCase();
  const mejor = $("#filtro-mejor").value;
  const destino = (id) => historial.destinos.get(id) || { nombre: "Destino retirado" };
  const sinLote = { nombre: "Lote eliminado", cantidad_animales: 0, categoria: "", peso_total_kg: 0, municipio_origen: "" };

  const filas = historial.simulaciones.filter((s) => {
    const lote = historial.lotes.get(s.lote_id) || sinLote;
    const donde = `${lote.nombre} ${lote.finca || ""} ${lote.municipio_origen} ${nombreProductor(lote)}`.toLowerCase();
    return (!texto || donde.includes(texto)) && (!mejor || s.mejor_destino_id === mejor);
  });

  const sinNada = historial.simulaciones.length === 0;
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
    const lote = historial.lotes.get(s.lote_id) || sinLote;
    const r1 = s.resultados.find((r) => r.posicion === 1) || s.resultados[0];
    const avisos = s.resultados.filter((r) => r.advertencia).length;
    const filasDetalle = [...s.resultados].sort((a, b) => a.posicion - b.posicion).map((r) => `
      <tr class="${r.posicion === 1 ? "es-mejor" : ""}">
        <th scope="row">${escapar(destino(r.destino_id).nombre)}${r.posicion === 1 ? ' <span class="etiqueta">Mejor</span>' : ""}</th>
        <td>${fmt.km(r.distancia_km)}</td>
        <td>${celdaPrecio(r)}</td>
        <td>${fmt.cop(r.costo_logistico_cop)}</td>
        <td class="${r.utilidad_neta_cop < 0 ? "negativo" : ""}"><strong>${fmt.cop(r.utilidad_neta_cop)}</strong></td>
      </tr>`).join("");
    const productor = nombreProductor(lote);
    return `<li>
      <details class="simulacion">
        <summary>
          <span class="sim-fecha"><time datetime="${s.creado_en}">${fmt.fecha(s.creado_en)}</time></span>
          <span class="sim-lote"><strong>${escapar(lote.nombre)}</strong>
            <span>${lote.categoria ? `${animales(lote.cantidad_animales, lote.categoria)}, ${fmt.kg(lote.peso_total_kg)}.` : ""} ${escapar(productor)}</span></span>
          <span class="sim-mejor"><span>Mejor destino</span><strong>${escapar(destino(s.mejor_destino_id).nombre)}</strong>
            <span>${r1 ? fmt.millones(r1.utilidad_neta_cop) : ""}</span></span>
        </summary>
        <div class="simulacion__detalle">
          <p>Calculada el ${fmt.fechaHora(s.creado_en)} con flete de ${fmt.cop(s.flete_km_cop)} por km, ${s.capacidad_camion} animales por camión${s.flete_incluye_peajes ? " y peajes incluidos en el flete" : ""}, para ${s.resultados.length} destinos.
            ${lote.finca ? `${escapar(lote.finca)}, ` : ""}${escapar(lote.municipio_origen)}.${avisos ? ` <strong>${avisos} ${avisos === 1 ? "precio tenía" : "precios tenían"} más de ${DIAS_ADVERTENCIA} días.</strong>` : ""}</p>
          <div class="tabla-envoltura" tabindex="0" role="region" aria-label="Resultados de la simulación del ${fmt.fecha(s.creado_en)}">
            <table>
              <caption>Resultados por destino</caption>
              <thead><tr><th scope="col">Destino</th><th scope="col">Distancia</th><th scope="col">Precio por kg</th><th scope="col">Flete, peajes y comisión</th><th scope="col">Utilidad neta</th></tr></thead>
              <tbody>${filasDetalle}</tbody>
            </table>
          </div>
          <div class="acciones">
            <a class="boton" href="index.html?simulacion=${encodeURIComponent(s.id)}">Abrir en el tablero</a>
            ${historial.lotes.has(s.lote_id) ? `<a class="boton boton--secundario" href="detalle.html?lote=${encodeURIComponent(s.lote_id)}&amp;simulacion=${encodeURIComponent(s.id)}">Editar el lote y recalcular</a>` : ""}
            ${Api.modoDemo() ? "" : `<button type="button" class="boton boton--secundario" data-eliminar="${s.id}">Eliminar<span class="sr-only"> la simulación del ${fmt.fecha(s.creado_en)}</span></button>`}
          </div>
        </div>
      </details>
    </li>`;
  }).join("");
}

/* ------------------------------------------------------------------ */
/* Pantalla de precios                                                 */
/* ------------------------------------------------------------------ */

const precios = { vigentes: [], destinos: [], listo: false };

function estadoPrecio(dias) {
  if (dias > DIAS_MAXIMO) return ["vencido", `Vencido: más de ${DIAS_MAXIMO} días, no se compara`];
  if (dias > DIAS_ADVERTENCIA) return ["aviso", `Con advertencia: más de ${DIAS_ADVERTENCIA} días`];
  return ["ok", "Al día"];
}

async function iniciarPrecios() {
  mostrarEstado("cargando");
  try {
    await cargar(async () => {
      precios.destinos = await todos("/destinos", { publica: true });
      const listas = await Promise.all(precios.destinos.map((d) => Api.get(`/destinos/${d.id}/precios`, { publica: true })));
      // Cada lista viene de la más reciente a la más antigua: el primero de cada categoría es el vigente.
      precios.vigentes = listas.flatMap((lista, i) => {
        const vistos = new Set();
        return lista.filter((p) => !vistos.has(p.categoria) && vistos.add(p.categoria))
          .map((p) => ({ ...p, destino: precios.destinos[i] }));
      });
    });
  } catch (e) {
    mostrarError(e);
    return;
  }
  mostrarEstado("datos");
  pintarPrecios();

  const admin = esAdmin();
  $$('[data-rol="administrador"]').forEach((el) => { el.hidden = !admin; });
  if (admin) {
    cargarImportaciones();
    if (!precios.listo) {
      precios.listo = true;
      $("#btn-descargar-hoja").addEventListener("click", descargarHoja);
      $("#form-carga").addEventListener("submit", subirHoja);
    }
  }
}

function pintarPrecios() {
  const orden = Object.keys(CATEGORIAS);
  const filas = [...precios.vigentes].sort((a, b) =>
    a.destino.nombre.localeCompare(b.destino.nombre, "es") || orden.indexOf(a.categoria) - orden.indexOf(b.categoria));
  const cuenta = { ok: 0, aviso: 0, vencido: 0, estimado: 0 };
  $("#tabla-precios").innerHTML = filas.map((p) => {
    const [clase, texto] = estadoPrecio(p.antiguedad_dias);
    cuenta[clase] += 1;
    const ref = p.referencia ? `<small>${escapar(p.referencia)}</small>` : "";
    // Los precios de la semilla son estimaciones del equipo: se marcan hasta que se reemplacen con Fedegán.
    const estimado = !/fedeg[aá]n/i.test(`${p.fuente} ${p.referencia || ""}`);
    if (estimado) cuenta.estimado += 1;
    const marca = estimado ? ' <span class="insignia insignia--aviso">Estimado, no es de Fedegán</span>' : "";
    return `<tr>
      <th scope="row" class="fila-destino">${escapar(p.destino.nombre)}<small>${TIPOS[p.destino.tipo]}, ${escapar(p.destino.municipio)}</small></th>
      <td class="izq">${escapar(CATEGORIAS[p.categoria][0])}</td>
      <td>${fmt.cop(p.precio_kg_cop)}<small class="dato-fecha">≈ ${fmt.arroba(p.precio_kg_cop)}</small></td>
      <td>${fmt.dia(p.fecha)}<small class="dato-fecha">hace ${p.antiguedad_dias} ${p.antiguedad_dias === 1 ? "día" : "días"}</small></td>
      <td class="izq"><span class="insignia insignia--${clase}">${texto}</span>${marca}</td>
      <td class="izq">${escapar(p.fuente)}${ref}</td>
      ${esAdmin() ? `<td class="izq acciones-fila"><button type="button" class="boton boton--peq boton--secundario" data-accion="editar-precio" data-id="${p.id}">Corregir</button> <button type="button" class="boton boton--peq boton--secundario" data-accion="eliminar-precio" data-id="${p.id}">Eliminar</button></td>` : ""}
    </tr>`;
  }).join("") || '<tr><td colspan="7" class="izq">Todavía no hay precios cargados.</td></tr>';
  const ultima = filas.reduce((m, p) => (p.fecha > m ? p.fecha : m), "");
  $("#resumen-precios").textContent = filas.length
    ? `${filas.length} precios vigentes: ${cuenta.ok} al día, ${cuenta.aviso} con advertencia y ${cuenta.vencido} vencidos. El más reciente es del ${fmt.dia(ultima)}.` +
      (cuenta.estimado ? ` Atención: ${cuenta.estimado} de ellos son estimaciones del equipo y deben reemplazarse con el reporte de Fedegán.` : " Todos vienen de Fedegán.")
    : "No hay precios cargados.";
}

async function cargarImportaciones() {
  try {
    const cargas = await Api.get("/precios/importaciones");
    $("#tabla-cargas").innerHTML = cargas.map((c) => `<tr>
      <td>${fmt.fechaHora(c.creado_en)}</td>
      <td class="izq">${escapar(c.fuente)}</td>
      <td class="izq">${c.origen === "programada" ? "Automática (cada 3 días)" : "Manual"}</td>
      <td>${c.insertados}</td><td>${c.actualizados}</td><td>${c.sin_cambios}</td>
    </tr>`).join("") || '<tr><td colspan="6" class="izq">Todavía no se ha cargado ninguna hoja.</td></tr>';
  } catch (e) {
    $("#tabla-cargas").innerHTML = `<tr><td colspan="6" class="izq">No se pudo leer el historial de cargas: ${escapar(e.message)}</td></tr>`;
  }
}

function descargarHoja() {
  const campo = (v) => {
    const t = String(v ?? "");
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const filas = [["destino", "categoria", "precio_kg_cop", "fecha", "fuente", "referencia"]];
  [...precios.vigentes]
    .sort((a, b) => a.destino.nombre.localeCompare(b.destino.nombre, "es") || a.categoria.localeCompare(b.categoria))
    .forEach((p) => filas.push([p.destino.nombre, p.categoria, p.precio_kg_cop, p.fecha, p.fuente, p.referencia]));
  // Punto y coma y marca BOM: así Excel en español la abre en columnas y con tildes.
  const texto = `﻿${filas.map((f) => f.map(campo).join(";")).join("\r\n")}\r\n`;
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `precios-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function subirHoja(ev) {
  ev.preventDefault();
  const archivo = $("#archivo-precios").files[0];
  const errores = $("#errores-carga");
  const resultado = $("#resultado-carga");
  resultado.hidden = true;
  if (!archivo) { mostrarResumen(errores, ["Elija el archivo .csv con los precios."], "Falta el archivo"); return; }
  if (archivo.size > 1024 * 1024) { mostrarResumen(errores, ["El archivo pesa más de 1 MB. ¿Es la hoja correcta?"], "Archivo demasiado grande"); return; }
  const boton = $("#form-carga button");
  boton.disabled = true;
  boton.textContent = "Cargando…";
  try {
    const texto = await archivo.text();
    const r = await Api.post("/precios/importacion", texto, { tipo: "text/csv" });
    errores.hidden = true;
    resultado.innerHTML = `<p><strong>Precios cargados.</strong> ${r.filas} filas: ${r.insertados} nuevos, ${r.actualizados} cambiados y ${r.sin_cambios} iguales. Las próximas simulaciones ya usan estos precios.</p>`;
    resultado.hidden = false;
    $("#form-carga").reset();
    await iniciarPrecios();
    resultado.focus?.();
  } catch (e) {
    const lineas = e.detalles.length ? e.detalles.map((d) => `${d.campo}: ${d.problema}`) : [e.message];
    mostrarResumen(errores, lineas, e.detalles.length ? `${e.message}` : "No se pudo cargar la hoja");
  } finally {
    boton.disabled = false;
    boton.textContent = "Cargar precios";
  }
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
  pintarSesion();
  const pagina = document.body.dataset.pagina;
  const inicio = { ingreso: iniciarIngreso, tablero: iniciarTablero, formulario: iniciarFormulario, historial: iniciarHistorial, precios: iniciarPrecios }[pagina];
  if (!inicio) return;
  inicio();
  $("#btn-reintentar")?.addEventListener("click", () => {
    if (DEMO) window.location.href = window.location.pathname.split("/").pop() || "index.html";
    else inicio();
  });
});
