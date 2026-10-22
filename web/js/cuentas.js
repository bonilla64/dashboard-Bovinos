/* Simulador de Destinos Ganaderos · cuentas, fincas, lotes y administración (Entrega 3)
 *
 * Pantallas: registro (en ingreso.html), Mi cuenta (cuenta.html), Mis lotes (lotes.html)
 * y Administración (admin.html, solo administradores). Usa las utilidades de js/app.js ($, escapar, fmt, todos…).
 *
 * La validación se hace dos veces: aquí, para avisar antes de enviar, y en el servidor, que es quien decide
 * (contrato api/openapi.yaml). Los errores del servidor ({ detalles: [{ campo, problema }] }) se muestran
 * junto a cada campo.
 */
"use strict";

/* ------------------------------------------------------------------ */
/* Datos fijos                                                         */
/* ------------------------------------------------------------------ */

// Cabeceras municipales de Casanare [longitud, latitud] (las mismas de api/src/geo/origenes.js).
const CABECERAS = {
  Yopal: [-72.3959, 5.3371], Aguazul: [-72.5547, 5.1727], "Chámeza": [-72.8717, 5.2139], "Hato Corozal": [-71.7653, 6.1561],
  "La Salina": [-72.3347, 6.1278], "Maní": [-72.2794, 4.8166], Monterrey: [-72.8956, 4.8786], "Nunchía": [-72.1956, 5.6372],
  "Orocué": [-71.3394, 4.7908], "Paz de Ariporo": [-71.8919, 5.8811], Pore: [-71.9928, 5.7278], Recetor: [-72.7614, 5.2292],
  Sabanalarga: [-73.04, 4.8544], "Sácama": [-72.2486, 6.0981], "San Luis de Palenque": [-71.7314, 5.4222],
  "Támara": [-72.1622, 5.8297], Tauramena: [-72.7475, 5.018], Trinidad: [-71.6625, 5.4092], Villanueva: [-72.9286, 4.6106],
};
const MUNICIPIOS = Object.keys(CABECERAS).sort((a, b) => a.localeCompare(b, "es"));
const MAX_KM_CABECERA = 120;
const DOCUMENTOS = { CC: "Cédula de ciudadanía", CE: "Cédula de extranjería", NIT: "NIT" };
const ESTADOS_LOTE = { disponible: "Disponible", simulado: "Comparado", vendido: "Vendido" };
const ROLES = { productor: "Productor", administrador: "Administrador" };
const ACCIONES = {
  registrar: "Se registró", crear: "Creó", actualizar: "Modificó", eliminar: "Eliminó", suspender: "Suspendió",
  reactivar: "Reactivó", cambiar_rol: "Cambió el rol", restablecer_contrasena: "Restableció la contraseña",
  verificar_documento: "Verificó el documento", quitar_verificacion: "Quitó la verificación", importar: "Importó",
  anonimizar: "Anonimizó", desactivar: "Desactivó", cambiar_contrasena: "Cambió su contraseña",
  solicitar_contrasena: "Pidió una contraseña nueva", descartar_solicitud: "Descartó la solicitud de contraseña de",
};
const RECURSOS = { usuario: "cuenta", cuenta: "cuenta", perfil: "su perfil", productor: "productor", finca: "finca", destino: "destino", ruta: "ruta", precio: "precio" };

/* ------------------------------------------------------------------ */
/* Reglas de identidad (las mismas del servidor, api/src/identidad.js) */
/* ------------------------------------------------------------------ */

function digitoVerificacion(nit) {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const suma = String(nit).split("").reverse().reduce((s, d, i) => s + Number(d) * pesos[i], 0);
  const resto = suma % 11;
  return resto > 1 ? 11 - resto : resto;
}

function revisarDocumento(tipo, numero) {
  const t = String(numero || "").trim().replace(/[.\s]/g, "");
  if (!t) return "Escriba el número de documento.";
  if (tipo === "CC" && !/^\d{5,10}$/.test(t)) return "La cédula debe tener entre 5 y 10 dígitos, sin puntos.";
  if (tipo === "CE" && !/^\d{6,10}$/.test(t)) return "La cédula de extranjería debe tener entre 6 y 10 dígitos.";
  if (tipo === "NIT") {
    const m = t.match(/^(\d{9})-?(\d)$/);
    if (!m) return "El NIT debe tener 9 dígitos y el dígito de verificación, por ejemplo 900123456-7.";
    const dv = digitoVerificacion(m[1]);
    if (dv !== Number(m[2])) return `El dígito de verificación no corresponde: para ${m[1]} debe ser ${dv}.`;
  }
  return "";
}

function distanciaKm([lon1, lat1], [lon2, lat2]) {
  const r = (g) => (g * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/* ------------------------------------------------------------------ */
/* Formularios: campos, lectura y errores                              */
/* ------------------------------------------------------------------ */

const opcionesHtml = (lista, valor, vacio) =>
  (vacio ? `<option value="">${escapar(vacio)}</option>` : "") +
  lista.map(([v, t]) => `<option value="${escapar(v)}"${String(valor ?? "") === String(v) ? " selected" : ""}>${escapar(t)}</option>`).join("");

/**
 * HTML de un campo con su etiqueta, ayuda y lugar para el error.
 * El id es `${prefijo}${nombre}`; el error va en `${id}-error`.
 */
function campo({ prefijo = "", nombre, etiqueta, tipo = "text", valor = "", opciones, vacio, ayuda, opcional, ancho, atributos = "", oculto }) {
  const id = `${prefijo}${nombre}`;
  const desc = [ayuda ? `${id}-ayuda` : "", `${id}-error`].filter(Boolean).join(" ");
  let control;
  if (tipo === "select") {
    control = `<select id="${id}" name="${nombre}" aria-describedby="${desc}" ${atributos}>${opcionesHtml(opciones, valor, vacio)}</select>`;
  } else if (tipo === "textarea") {
    control = `<textarea id="${id}" name="${nombre}" aria-describedby="${desc}" ${atributos}>${escapar(valor)}</textarea>`;
  } else {
    control = `<input type="${tipo}" id="${id}" name="${nombre}" value="${escapar(valor ?? "")}" aria-describedby="${desc}" ${atributos}>`;
  }
  return `<div class="campo${ancho ? " campo--ancho" : ""}" data-campo="${nombre}"${oculto ? " hidden" : ""}>
    <label for="${id}">${escapar(etiqueta)}${opcional ? ' <span class="opcional">(opcional)</span>' : ""}</label>
    ${ayuda ? `<p class="ayuda" id="${id}-ayuda">${ayuda}</p>` : ""}
    ${control}
    <p class="error-campo" id="${id}-error"></p>
  </div>`;
}

/** Pone (o quita) el error de un campo, buscándolo por su atributo name. Devuelve false si no existe. */
function errorEn(form, nombre, mensaje) {
  const el = form.querySelector(`[name="${nombre}"]`);
  if (!el) return false;
  const salida = document.getElementById(`${el.id}-error`);
  if (salida) salida.textContent = mensaje || "";
  el.setAttribute("aria-invalid", mensaje ? "true" : "false");
  return true;
}

function limpiarErrores(form, caja) {
  $$("[aria-invalid]", form).forEach((el) => el.setAttribute("aria-invalid", "false"));
  $$(".error-campo", form).forEach((p) => { p.textContent = ""; });
  if (caja) caja.hidden = true;
}

/** Muestra errores locales ([campo, mensaje]) junto a cada campo y en el resumen. */
function mostrarErrores(form, caja, errores, titulo = "Revise lo siguiente") {
  errores.forEach(([c, m]) => errorEn(form, c, m));
  mostrarResumen(caja, errores.map(([, m]) => m), titulo);
}

/** Convierte un error de la API en errores por campo + resumen. */
function mostrarErrorApi(form, caja, e, etiquetas = {}) {
  const sueltos = [];
  (e.detalles || []).forEach((d) => {
    if (!errorEn(form, d.campo, d.problema)) sueltos.push(`${etiquetas[d.campo] || d.campo}: ${d.problema}`);
  });
  const lineas = (e.detalles || []).map((d) => `${etiquetas[d.campo] || d.campo}: ${d.problema}`);
  mostrarResumen(caja, lineas.length ? lineas : [e.message], lineas.length ? e.message : "No se pudo guardar");
  return sueltos;
}

/** Lee los campos con name de un formulario. Texto vacío → null; números → Number; casillas → boolean. */
function leerFormulario(form) {
  const datos = {};
  $$("[name]", form).forEach((el) => {
    if (el.closest("[hidden]") || el.disabled) return;
    if (el.type === "radio") { if (el.checked) datos[el.name] = el.value; return; }
    if (el.type === "checkbox") { datos[el.name] = el.checked; return; }
    const v = el.type === "password" ? el.value : el.value.trim();
    datos[el.name] = v === "" ? null : (el.type === "number" ? Number(v) : v);
  });
  return datos;
}

/** Quita del objeto los campos que no cambiaron respecto a `antes` (para enviar un PATCH mínimo). */
function soloCambios(datos, antes) {
  return Object.fromEntries(Object.entries(datos).filter(([k, v]) => (antes[k] ?? null) !== v));
}

/* ------------------------------------------------------------------ */
/* Ventanas (dialog) y avisos                                          */
/* ------------------------------------------------------------------ */

/**
 * Abre una ventana con un formulario. `alEnviar(form, datos)` guarda; si lanza un ErrorApi, los errores se
 * muestran en la misma ventana y no se cierra. `validar(datos, form)` devuelve [[campo, mensaje]].
 */
function abrirFormulario({ titulo, html, boton = "Guardar", peligro = false, validar, alEnviar, alAbrir }) {
  return new Promise((resolver) => {
    const d = document.createElement("dialog");
    d.className = "dialogo";
    d.setAttribute("aria-labelledby", "dialogo-titulo");
    d.innerHTML = `<form class="formulario" novalidate>
      <h2 id="dialogo-titulo">${escapar(titulo)}</h2>
      <div class="resumen-errores" role="alert" tabindex="-1" hidden></div>
      <div class="dialogo__cuerpo">${html}</div>
      <div class="acciones">
        <button type="submit" class="boton${peligro ? " boton--peligro" : ""}">${escapar(boton)}</button>
        <button type="button" class="boton boton--secundario" data-cerrar>Cancelar</button>
      </div>
    </form>`;
    document.body.append(d);
    const form = $("form", d);
    const caja = $(".resumen-errores", d);
    const cerrar = (valor) => { d.close(); d.remove(); resolver(valor); };
    $("[data-cerrar]", d).addEventListener("click", () => cerrar(null));
    d.addEventListener("cancel", (ev) => { ev.preventDefault(); cerrar(null); });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      limpiarErrores(form, caja);
      const datos = leerFormulario(form);
      const errores = validar ? validar(datos, form) : [];
      if (errores.length) { mostrarErrores(form, caja, errores); return; }
      const b = $('button[type="submit"]', form);
      b.disabled = true;
      try {
        const r = alEnviar ? await alEnviar(datos, form) : datos;
        cerrar(r ?? true);
      } catch (e) {
        if (!(e instanceof Api.ErrorApi)) throw e;
        mostrarErrorApi(form, caja, e);
        b.disabled = false;
      }
    });
    d.showModal();
    alAbrir?.(form, d);
    ($("input:not([type=hidden]), select, textarea", form) || $("button", form)).focus();
  });
}

/** Confirmación propia (sin window.confirm). Devuelve true si la persona acepta. */
async function confirmar(titulo, texto, boton = "Sí, continuar", peligro = true) {
  return Boolean(await abrirFormulario({ titulo, html: `<p>${texto}</p>`, boton, peligro }));
}

function avisar(selector, html, tipo = "") {
  const el = $(selector);
  if (!el) return;
  el.className = `aviso${tipo ? ` aviso--${tipo}` : ""}`;
  el.innerHTML = `<p>${html}</p>`;
  el.hidden = false;
  el.focus?.();
}

const insignia = (texto, clase = "") => `<span class="insignia${clase ? ` insignia--${clase}` : ""}">${escapar(texto)}</span>`;
const botonAccion = (accion, id, texto, extra = "") =>
  `<button type="button" class="boton boton--peq boton--secundario" data-accion="${accion}" data-id="${escapar(id)}" ${extra}>${escapar(texto)}</button>`;

/** Conecta los botones data-accion de una tabla con un objeto de manejadores. */
function delegarAcciones(contenedor, manejadores) {
  if (contenedor.dataset.delegado) return;
  contenedor.dataset.delegado = "1";
  contenedor.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button[data-accion]");
    if (!b || !manejadores[b.dataset.accion]) return;
    b.disabled = true;
    try { await manejadores[b.dataset.accion](b.dataset.id, b); } finally { b.disabled = false; }
  });
}

/* ------------------------------------------------------------------ */
/* Ficha del productor: persona o empresa, documento y ubicación        */
/* ------------------------------------------------------------------ */

/**
 * Campos de la ficha. Opciones: correo, contrasena, consentimiento (registro), bloquearDocumento (ya verificado).
 */
function htmlFicha(prefijo, v = {}, o = {}) {
  const empresa = v.tipo_persona === "juridica";
  const docs = empresa ? [["NIT", DOCUMENTOS.NIT]] : [["CC", DOCUMENTOS.CC], ["CE", DOCUMENTOS.CE]];
  const bloq = o.bloquearDocumento ? "disabled" : "";
  return `
    <fieldset class="campo campo--ancho" data-campo="tipo_persona">
      <legend>¿Cómo se registra?</legend>
      <div class="opciones">
        <label class="opcion"><input type="radio" name="tipo_persona" value="natural" ${empresa ? "" : "checked"} ${bloq}> <span>Como persona (cédula)</span></label>
        <label class="opcion"><input type="radio" name="tipo_persona" value="juridica" ${empresa ? "checked" : ""} ${bloq}> <span>Como empresa (NIT)</span></label>
      </div>
    </fieldset>
    ${campo({ prefijo, nombre: "nombre_completo", etiqueta: empresa ? "Razón social" : "Nombre completo", valor: v.nombre_completo, atributos: 'required minlength="3" maxlength="120" autocomplete="name"' })}
    ${campo({ prefijo, nombre: "representante_legal", etiqueta: "Representante legal", valor: v.representante_legal, oculto: !empresa, atributos: 'minlength="3" maxlength="120"' })}
    ${campo({ prefijo, nombre: "tipo_documento", etiqueta: "Tipo de documento", tipo: "select", opciones: docs, valor: v.tipo_documento || docs[0][0], atributos: bloq })}
    ${campo({ prefijo, nombre: "numero_documento", etiqueta: "Número de documento", valor: v.numero_documento,
    ayuda: empresa ? "NIT con dígito de verificación, por ejemplo 900123456-7." : "Sin puntos ni espacios.",
    atributos: `required maxlength="15" inputmode="numeric" autocomplete="off" ${bloq}` })}
    ${o.correo ? campo({ prefijo, nombre: "correo", etiqueta: "Correo", tipo: "email", valor: v.correo, atributos: 'required maxlength="120" autocomplete="email"' }) : ""}
    ${o.contrasena ? campo({ prefijo, nombre: "contrasena", etiqueta: o.etiquetaContrasena || "Contraseña", tipo: "password", ayuda: "Mínimo 10 caracteres. Se guarda cifrada.", atributos: 'required minlength="10" maxlength="72" autocomplete="new-password"' }) : ""}
    ${campo({ prefijo, nombre: "municipio", etiqueta: "Municipio (Casanare)", tipo: "select", opciones: MUNICIPIOS.map((m) => [m, m]), vacio: "Seleccione el municipio", valor: v.municipio, atributos: "required" })}
    ${campo({ prefijo, nombre: "vereda", etiqueta: "Vereda", valor: v.vereda, opcional: true, atributos: 'maxlength="80"' })}
    ${campo({ prefijo, nombre: "telefono", etiqueta: "Celular", tipo: "tel", valor: v.telefono, opcional: true, atributos: 'inputmode="numeric" maxlength="10" autocomplete="tel"' })}
    ${o.consentimiento ? `<div class="campo campo--ancho" data-campo="acepta_tratamiento_datos">
      <label class="opcion"><input type="checkbox" id="${prefijo}acepta_tratamiento_datos" name="acepta_tratamiento_datos" aria-describedby="${prefijo}acepta_tratamiento_datos-error">
        <span>Autorizo el tratamiento de mis datos personales para usar el simulador (Ley 1581 de 2012). Puedo consultarlos, corregirlos o pedir que se borren desde «Mi cuenta».</span></label>
      <p class="error-campo" id="${prefijo}acepta_tratamiento_datos-error"></p>
    </div>` : ""}`;
}

/** Al cambiar entre persona y empresa se ajustan la etiqueta del nombre, el representante y los documentos. */
function conectarFicha(form) {
  const ajustar = () => {
    const empresa = form.querySelector('[name="tipo_persona"]:checked')?.value === "juridica";
    const etiqueta = form.querySelector('[data-campo="nombre_completo"] label');
    if (etiqueta) etiqueta.textContent = empresa ? "Razón social" : "Nombre completo";
    const rep = form.querySelector('[data-campo="representante_legal"]');
    if (rep) rep.hidden = !empresa;
    const sel = form.querySelector('[name="tipo_documento"]');
    if (sel && !sel.disabled) {
      const actual = sel.value;
      const docs = empresa ? ["NIT"] : ["CC", "CE"];
      sel.innerHTML = opcionesHtml(docs.map((d) => [d, DOCUMENTOS[d]]), docs.includes(actual) ? actual : docs[0]);
    }
    const ayuda = form.querySelector('[data-campo="numero_documento"] .ayuda');
    if (ayuda) ayuda.textContent = empresa ? "NIT con dígito de verificación, por ejemplo 900123456-7." : "Sin puntos ni espacios.";
  };
  $$('[name="tipo_persona"]', form).forEach((r) => r.addEventListener("change", ajustar));
  // El dígito de verificación se revisa apenas se sale del campo.
  form.querySelector('[name="numero_documento"]')?.addEventListener("blur", (ev) => {
    if (!ev.target.value.trim()) return;
    errorEn(form, "numero_documento", revisarDocumento(form.querySelector('[name="tipo_documento"]').value, ev.target.value));
  });
}

function validarFicha(d, o = {}) {
  const e = [];
  if (!d.nombre_completo || d.nombre_completo.length < 3) e.push(["nombre_completo", d.tipo_persona === "juridica" ? "Escriba la razón social (al menos 3 letras)." : "Escriba su nombre completo (al menos 3 letras)."]);
  if (d.tipo_persona === "juridica" && (!d.representante_legal || d.representante_legal.length < 3)) e.push(["representante_legal", "Una empresa debe indicar su representante legal."]);
  if (!o.documentoBloqueado) {
    const m = revisarDocumento(d.tipo_documento, d.numero_documento);
    if (m) e.push(["numero_documento", m]);
  }
  if (o.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo || "")) e.push(["correo", "Escriba un correo válido, por ejemplo nombre@correo.co."]);
  if (o.contrasena && (d.contrasena || "").length < 10) e.push(["contrasena", "La contraseña debe tener al menos 10 caracteres."]);
  if (!d.municipio) e.push(["municipio", "Seleccione el municipio."]);
  if (d.telefono && !/^3\d{9}$/.test(d.telefono)) e.push(["telefono", "El celular debe tener 10 dígitos y empezar por 3."]);
  if (o.consentimiento && !d.acepta_tratamiento_datos) e.push(["acepta_tratamiento_datos", "Debe autorizar el tratamiento de datos para crear la cuenta."]);
  return e;
}

/** Deja solo lo que corresponde al tipo de persona (una persona no tiene representante legal). */
function limpiarFicha(d) {
  const salida = { ...d };
  if (salida.tipo_persona === "natural") salida.representante_legal = null;
  if (salida.numero_documento) salida.numero_documento = salida.numero_documento.replace(/[.\s]/g, "");
  return salida;
}

const textoDocumento = (p) => (p?.numero_documento ? `${p.tipo_documento} ${p.numero_documento}` : "Sin documento");

/* ------------------------------------------------------------------ */
/* Registro (ingreso.html)                                             */
/* ------------------------------------------------------------------ */

function conectarRegistro() {
  const form = $("#form-registro");
  if (!form) return;
  const caja = $("#errores-registro");
  $("#campos-registro").innerHTML = htmlFicha("registro-", {}, { correo: true, contrasena: true, consentimiento: true });
  conectarFicha(form);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    limpiarErrores(form, caja);
    const datos = limpiarFicha(leerFormulario(form));
    const errores = validarFicha(datos, { correo: true, contrasena: true, consentimiento: true });
    if (errores.length) { mostrarErrores(form, caja, errores); return; }
    const boton = $('button[type="submit"]', form);
    boton.disabled = true;
    try {
      await Api.registrar(datos);
      window.location.href = "cuenta.html?motivo=bienvenida#fincas";
    } catch (e) {
      mostrarErrorApi(form, caja, e);
      boton.disabled = false;
    }
  });
}

/** «¿Olvidó su contraseña?»: la solicitud le llega a los administradores (no hay envío de correos). */
async function olvidoContrasena() {
  const correoEscrito = $("#ingreso-correo")?.value.trim() || "";
  const r = await abrirFormulario({
    titulo: "¿Olvidó su contraseña?",
    html: `<p>Escriba el correo y el documento con que se registró. Un administrador revisará la solicitud y le entregará una contraseña temporal, que deberá cambiar al ingresar.</p>
      <div class="campos">
        ${campo({ prefijo: "olvido-", nombre: "correo", etiqueta: "Correo", tipo: "email", valor: correoEscrito, atributos: 'required maxlength="120" autocomplete="username"' })}
        ${campo({ prefijo: "olvido-", nombre: "numero_documento", etiqueta: "Cédula o NIT", ayuda: "Sin puntos.", atributos: 'required maxlength="15" inputmode="numeric" autocomplete="off"' })}
      </div>`,
    boton: "Enviar solicitud",
    validar: (d) => {
      const e = [];
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo || "")) e.push(["correo", "Escriba el correo con que se registró."]);
      const n = String(d.numero_documento || "").replace(/[.\s]/g, "");
      if (!/^\d{5,10}(-?\d)?$/.test(n)) e.push(["numero_documento", "Escriba su cédula o NIT, solo números."]);
      return e;
    },
    alEnviar: (d) => Api.post("/auth/recuperacion", { correo: d.correo, numero_documento: d.numero_documento.replace(/[.\s]/g, "") }, { publica: true, redirigir: false }),
  });
  if (r) avisar("#aviso-ingreso", `<strong>Solicitud enviada.</strong> ${escapar(r.mensaje)}`, "ok");
}

/* ------------------------------------------------------------------ */
/* Sesión al día: rol, suspensión y contraseña temporal                */
/* ------------------------------------------------------------------ */

/**
 * En cada página se vuelve a pedir /auth/yo: si el administrador cambió el rol o suspendió la cuenta,
 * se nota de inmediato. También agrega a la navegación «Administración» y el enlace a «Mi cuenta».
 */
async function sesionAlDia() {
  if (Api.modoDemo() || !Api.sesion() || DEMO) return null;
  let yo;
  try {
    yo = await Api.get("/auth/yo");
  } catch (e) {
    return null; // 401 ya redirige a ingreso desde api.js
  }
  const s = Api.sesion();
  if (s) Api.guardarSesion({ token: s.token, usuario: yo, expira_en: Math.max(1, Math.round((s.expira - Date.now()) / 1000)) });
  pintarSesion();
  const enlaceNombre = $("#sesion span");
  if (enlaceNombre) enlaceNombre.outerHTML = `<a href="cuenta.html" class="sesion__nombre">${escapar(yo.nombre_completo)}${yo.rol === "administrador" ? " (administrador)" : ""}</a>`;
  const nav = $(".nav ul");
  if (nav && yo.rol === "administrador" && !$('a[href="admin.html"]', nav)) {
    const li = document.createElement("li");
    li.innerHTML = '<a href="admin.html">Administración</a>';
    nav.append(li);
    if (document.body.dataset.pagina === "admin") $("a", li).setAttribute("aria-current", "page");
  }
  const pagina = document.body.dataset.pagina;
  if (yo.rol === "administrador") $$('.nav a[href="lotes.html"]').forEach((a) => { a.textContent = "Lotes"; });
  if (yo.debe_cambiar_contrasena && pagina !== "cuenta") {
    window.location.href = "cuenta.html?motivo=temporal#contrasena";
    return null;
  }
  if (yo.productor && !yo.productor.numero_documento && pagina !== "cuenta" && !$("#aviso-perfil")) {
    const aviso = document.createElement("div");
    aviso.id = "aviso-perfil";
    aviso.className = "aviso";
    aviso.setAttribute("role", "note");
    aviso.innerHTML = '<p><strong>Complete su perfil.</strong> Falta su documento de identidad (cédula o NIT). <a href="cuenta.html#perfil">Completarlo ahora</a>.</p>';
    $("main")?.prepend(aviso);
  }
  return yo;
}

/* ------------------------------------------------------------------ */
/* Mi cuenta (cuenta.html)                                             */
/* ------------------------------------------------------------------ */

const cuenta = { yo: null, fincas: [], listo: false };

async function iniciarCuenta() {
  if (!exigirSesion()) return;
  if (Api.modoDemo()) { mostrarError(new Error("Mi cuenta necesita la API conectada.")); return; }
  mostrarEstado("cargando");
  try {
    cuenta.yo = await Api.get("/auth/yo");
    // Con contraseña temporal la API solo deja ver la cuenta y cambiar la contraseña.
    cuenta.fincas = cuenta.yo.productor_id && !cuenta.yo.debe_cambiar_contrasena ? await todos("/fincas") : [];
  } catch (e) { mostrarError(e); return; }
  mostrarEstado("datos");
  const motivo = params.get("motivo");
  if (cuenta.yo.debe_cambiar_contrasena) {
    avisar("#aviso-cuenta", "<strong>Debe cambiar su contraseña.</strong> Le asignaron una contraseña temporal; escriba una propia para seguir usando el simulador.", "alerta");
    $("#contrasena").scrollIntoView();
  } else if (motivo === "bienvenida") {
    avisar("#aviso-cuenta", "<strong>Cuenta creada.</strong> Registre ahora su finca: de ella salen sus lotes y desde su municipio se calculan las rutas.");
  }
  pintarPerfil();
  pintarFincas();
  if (!cuenta.listo) {
    cuenta.listo = true;
    $("#form-perfil").addEventListener("submit", guardarPerfil);
    $("#form-contrasena").addEventListener("submit", cambiarContrasena);
    $("#form-eliminar").addEventListener("submit", eliminarCuenta);
    $("#btn-nueva-finca").addEventListener("click", () => editarFinca(null));
    delegarAcciones($("#tabla-fincas"), {
      editar: (id) => editarFinca(cuenta.fincas.find((f) => f.id === id)),
      activar: (id) => cambiarEstadoFinca(id, true),
      desactivar: (id) => cambiarEstadoFinca(id, false),
      eliminar: eliminarFinca,
    });
  }
}

function pintarPerfil() {
  const { yo } = cuenta;
  const p = yo.productor;
  const form = $("#form-perfil");
  if (!p) {
    $("#estado-documento").textContent = `Cuenta de ${ROLES[yo.rol].toLowerCase()} sin ficha de productor.`;
    $("#campos-perfil").innerHTML = campo({ prefijo: "perfil-", nombre: "nombre_completo", etiqueta: "Nombre completo", valor: yo.nombre_completo, atributos: 'required minlength="3" maxlength="120"' })
      + campo({ prefijo: "perfil-", nombre: "correo", etiqueta: "Correo", tipo: "email", valor: yo.correo, atributos: 'required maxlength="120"' });
    return;
  }
  $("#estado-documento").innerHTML = p.documento_verificado
    ? `${insignia("Documento verificado", "ok")} El administrador verificó su ${p.tipo_documento}; para corregirlo comuníquese con él.`
    : (p.numero_documento ? `${insignia("Documento sin verificar", "aviso")} Un administrador revisará su documento.` : `${insignia("Falta el documento", "vencido")} Escriba su cédula o NIT para completar su perfil.`);
  $("#campos-perfil").innerHTML = htmlFicha("perfil-", { ...p, correo: yo.correo }, { correo: true, bloquearDocumento: p.documento_verificado })
    + `<p class="nota campo--ancho">Departamento: ${escapar(p.departamento)}. ${p.acepta_datos_en ? `Autorizó el tratamiento de datos el ${fmt.fecha(p.acepta_datos_en)}.` : ""}</p>`;
  conectarFicha(form);
}

async function guardarPerfil(ev) {
  ev.preventDefault();
  if (cuenta.yo.debe_cambiar_contrasena) { avisar("#aviso-cuenta", "Primero cambie la contraseña temporal; después podrá editar sus datos.", "alerta"); return; }
  const form = ev.target;
  const caja = $("#errores-perfil");
  limpiarErrores(form, caja);
  const { yo } = cuenta;
  const p = yo.productor;
  let datos = leerFormulario(form);
  if (p) {
    datos = limpiarFicha(datos);
    const errores = validarFicha(datos, { correo: true, documentoBloqueado: p.documento_verificado });
    if (errores.length) { mostrarErrores(form, caja, errores); return; }
  } else if (!datos.nombre_completo || !datos.correo) {
    mostrarErrores(form, caja, [["nombre_completo", "Escriba nombre y correo."]]); return;
  }
  const antes = { ...(p || {}), correo: yo.correo, nombre_completo: yo.nombre_completo };
  const cambios = soloCambios(datos, antes);
  if (!Object.keys(cambios).length) { avisar("#aviso-cuenta", "No hay cambios para guardar."); return; }
  const boton = $('button[type="submit"]', form);
  boton.disabled = true;
  try {
    cuenta.yo = await Api.patch("/auth/yo", cambios);
    pintarPerfil();
    await sesionAlDia();
    avisar("#aviso-cuenta", "<strong>Datos guardados.</strong>", "ok");
  } catch (e) {
    mostrarErrorApi(form, caja, e);
  } finally { boton.disabled = false; }
}

async function cambiarContrasena(ev) {
  ev.preventDefault();
  const form = ev.target;
  const caja = $("#errores-contrasena");
  limpiarErrores(form, caja);
  const d = leerFormulario(form);
  const errores = [];
  if (!d.contrasena_actual) errores.push(["contrasena_actual", "Escriba su contraseña actual."]);
  if ((d.contrasena_nueva || "").length < 10) errores.push(["contrasena_nueva", "La contraseña nueva debe tener al menos 10 caracteres."]);
  else if (d.contrasena_nueva === d.contrasena_actual) errores.push(["contrasena_nueva", "La contraseña nueva debe ser distinta de la actual."]);
  if (d.contrasena_nueva !== d.contrasena_repetir) errores.push(["contrasena_repetir", "Las dos contraseñas nuevas no coinciden."]);
  if (errores.length) { mostrarErrores(form, caja, errores); return; }
  try {
    await Api.post("/auth/contrasena", { contrasena_actual: d.contrasena_actual, contrasena_nueva: d.contrasena_nueva });
    form.reset();
    const eraTemporal = cuenta.yo.debe_cambiar_contrasena;
    cuenta.yo.debe_cambiar_contrasena = false;
    await sesionAlDia();
    if (eraTemporal && cuenta.yo.productor_id) { cuenta.fincas = await todos("/fincas"); pintarFincas(); }
    avisar("#aviso-cuenta", eraTemporal
      ? '<strong>Contraseña cambiada.</strong> Ya puede usar el simulador. <a href="index.html">Ir al tablero</a>.'
      : "<strong>Contraseña cambiada.</strong> Úsela la próxima vez que ingrese.", "ok");
  } catch (e) { mostrarErrorApi(form, caja, e); }
}

async function eliminarCuenta(ev) {
  ev.preventDefault();
  const form = ev.target;
  const caja = $("#errores-eliminar");
  limpiarErrores(form, caja);
  const contrasena = $("#eliminar-contrasena").value;
  const errores = [];
  if (!contrasena) errores.push(["contrasena", "Escriba su contraseña para confirmar."]);
  if (!$("#eliminar-entiendo").checked) errores.push(["", "Marque la casilla para confirmar que entiende."]);
  if (errores.length) { mostrarErrores(form, caja, errores, "Falta confirmar"); return; }
  try {
    await Api.del("/auth/yo", { cuerpo: { contrasena } });
    Api.cerrarSesion();
    window.location.href = "ingreso.html?motivo=eliminada";
  } catch (e) { mostrarErrorApi(form, caja, e); }
}

/* ---------- Fincas ---------- */

function pintarFincas() {
  const seccion = $("#fincas");
  seccion.hidden = !cuenta.yo.productor_id || cuenta.yo.debe_cambiar_contrasena;
  if (seccion.hidden) return;
  $("#tabla-fincas").innerHTML = cuenta.fincas.map((f) => {
    const lugar = [f.vereda ? `Vereda ${f.vereda}` : "", f.municipio].filter(Boolean).join(", ");
    const punto = f.ubicacion ? `<small>${f.ubicacion.coordinates[1].toFixed(4)}, ${f.ubicacion.coordinates[0].toFixed(4)}</small>` : "<small>Sin punto en el mapa</small>";
    const acciones = [botonAccion("editar", f.id, "Editar"),
      f.activo ? botonAccion("desactivar", f.id, "Desactivar") : botonAccion("activar", f.id, "Activar"),
      f.lotes ? "" : botonAccion("eliminar", f.id, "Eliminar")].join(" ");
    return `<tr>
      <th scope="row" class="izq">${escapar(f.nombre)}</th>
      <td class="izq">${escapar(lugar)}${punto}</td>
      <td>${f.area_ha ? `${numero.format(f.area_ha)} ha` : "—"}</td>
      <td>${f.lotes ? `<a href="lotes.html?finca_id=${f.id}">${f.lotes}</a>` : "0"}</td>
      <td class="izq">${f.activo ? insignia("Activa", "ok") : insignia("Inactiva", "aviso")}</td>
      <td class="izq acciones-fila">${acciones}</td>
    </tr>`;
  }).join("") || '<tr><td colspan="6" class="izq">Todavía no tiene fincas registradas. Registre la primera para asociarle sus lotes.</td></tr>';
}

/** Formulario de finca con mapa: un clic en el mapa pone el punto; también se puede escribir. */
function htmlFinca(f = {}) {
  const [lon, lat] = f.ubicacion?.coordinates || [];
  return `<div class="campos">
    ${campo({ prefijo: "finca-", nombre: "nombre", etiqueta: "Nombre de la finca o hato", valor: f.nombre, atributos: 'required minlength="3" maxlength="80"' })}
    ${campo({ prefijo: "finca-", nombre: "municipio", etiqueta: "Municipio", tipo: "select", opciones: MUNICIPIOS.map((m) => [m, m]), vacio: "Seleccione", valor: f.municipio, atributos: "required" })}
    ${campo({ prefijo: "finca-", nombre: "vereda", etiqueta: "Vereda", valor: f.vereda, opcional: true, atributos: 'maxlength="80"' })}
    ${campo({ prefijo: "finca-", nombre: "area_ha", etiqueta: "Área (hectáreas)", tipo: "number", valor: f.area_ha, opcional: true, atributos: 'min="0.1" max="100000" step="0.1" inputmode="decimal"' })}
    ${campo({ prefijo: "finca-", nombre: "latitud", etiqueta: "Latitud", tipo: "number", valor: lat, opcional: true, atributos: 'step="0.0001" min="-90" max="90" inputmode="decimal"' })}
    ${campo({ prefijo: "finca-", nombre: "longitud", etiqueta: "Longitud", tipo: "number", valor: lon, opcional: true, atributos: 'step="0.0001" min="-180" max="180" inputmode="decimal"' })}
  </div>
  <p class="ayuda">Haga clic en el mapa donde queda la finca (o escriba las coordenadas). Debe quedar a menos de ${MAX_KM_CABECERA} km de la cabecera del municipio.</p>
  <div class="mapa mapa--finca" id="mapa-finca" role="application" aria-label="Mapa para marcar la ubicación de la finca"></div>`;
}

function conectarMapaFinca(form) {
  if (!window.L) return;
  const lat = $('[name="latitud"]', form);
  const lon = $('[name="longitud"]', form);
  const mun = $('[name="municipio"]', form);
  const centro = () => (lat.value && lon.value ? [Number(lat.value), Number(lon.value)] : [...(CABECERAS[mun.value] || CABECERAS.Yopal)].reverse());
  const mapa = L.map("mapa-finca", { scrollWheelZoom: false }).setView(centro(), lat.value ? 12 : 10);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(mapa);
  let marca = lat.value && lon.value ? L.marker(centro()).addTo(mapa) : null;
  mapa.on("click", (ev) => {
    lat.value = ev.latlng.lat.toFixed(4);
    lon.value = ev.latlng.lng.toFixed(4);
    if (marca) marca.setLatLng(ev.latlng); else marca = L.marker(ev.latlng).addTo(mapa);
  });
  mun.addEventListener("change", () => { if (!lat.value) mapa.setView(centro(), 10); });
  setTimeout(() => mapa.invalidateSize(), 50);
}

function validarFinca(d) {
  const e = [];
  if (!d.nombre || d.nombre.length < 3) e.push(["nombre", "Escriba el nombre de la finca (al menos 3 letras)."]);
  if (!d.municipio) e.push(["municipio", "Seleccione el municipio."]);
  if (d.area_ha !== null && d.area_ha !== undefined && !(d.area_ha > 0 && d.area_ha <= 100000)) e.push(["area_ha", "El área debe estar entre 0,1 y 100.000 hectáreas."]);
  const conPunto = d.latitud !== null || d.longitud !== null;
  if (conPunto) {
    if (d.latitud === null || d.longitud === null) e.push(["latitud", "Escriba latitud y longitud, o deje las dos vacías."]);
    else if (d.municipio && distanciaKm(CABECERAS[d.municipio], [d.longitud, d.latitud]) > MAX_KM_CABECERA) {
      e.push(["latitud", `El punto queda a ${Math.round(distanciaKm(CABECERAS[d.municipio], [d.longitud, d.latitud]))} km de ${d.municipio}; revise el punto o el municipio.`]);
    }
  }
  return e;
}

const cuerpoFinca = (d) => {
  const { latitud, longitud, ...resto } = d;
  return { ...resto, ubicacion: latitud !== null && longitud !== null ? { type: "Point", coordinates: [longitud, latitud] } : null };
};

async function editarFinca(f, productorId = null) {
  const r = await abrirFormulario({
    titulo: f ? `Editar ${f.nombre}` : "Registrar una finca",
    html: htmlFinca(f || { municipio: cuenta.yo?.productor?.municipio }),
    validar: validarFinca,
    alAbrir: conectarMapaFinca,
    alEnviar: async (d) => {
      const cuerpo = cuerpoFinca(d);
      if (f) {
        const cambios = soloCambios(cuerpo, f);
        if (JSON.stringify(cuerpo.ubicacion) === JSON.stringify(f.ubicacion)) delete cambios.ubicacion;
        if (!Object.keys(cambios).length) return f;
        return Api.patch(`/fincas/${f.id}`, cambios);
      }
      if (productorId) cuerpo.productor_id = productorId;
      return Api.post("/fincas", cuerpo);
    },
  });
  if (!r) return;
  if (document.body.dataset.pagina === "cuenta") {
    cuenta.fincas = await todos("/fincas");
    pintarFincas();
    avisar("#aviso-cuenta", f ? `<strong>${escapar(r.nombre)}</strong> actualizada${f.municipio !== r.municipio && r.lotes ? `; sus ${r.lotes} lotes ahora salen de ${escapar(r.municipio)}` : ""}.`
      : `<strong>${escapar(r.nombre)}</strong> registrada. <a href="detalle.html">Registrar un lote de esta finca</a>.`, "ok");
  }
}

async function cambiarEstadoFinca(id, activo) {
  try {
    const f = await Api.patch(`/fincas/${id}`, { activo });
    cuenta.fincas = cuenta.fincas.map((x) => (x.id === id ? f : x));
    pintarFincas();
    avisar("#aviso-cuenta", activo ? `${escapar(f.nombre)} vuelve a estar activa.` : `${escapar(f.nombre)} quedó inactiva: sus lotes se conservan, pero no se le pueden agregar lotes nuevos.`, "ok");
  } catch (e) { avisar("#aviso-cuenta", escapar(e.message), "alerta"); }
}

async function eliminarFinca(id) {
  const f = cuenta.fincas.find((x) => x.id === id);
  if (!(await confirmar(`¿Eliminar ${f.nombre}?`, "La finca no tiene lotes, así que se borra por completo.", "Eliminar"))) return;
  try {
    await Api.del(`/fincas/${id}`);
    cuenta.fincas = cuenta.fincas.filter((x) => x.id !== id);
    pintarFincas();
    avisar("#aviso-cuenta", `${escapar(f.nombre)} eliminada.`, "ok");
  } catch (e) { avisar("#aviso-cuenta", escapar(e.message), "alerta"); }
}

/* ------------------------------------------------------------------ */
/* Mis lotes (lotes.html)                                              */
/* ------------------------------------------------------------------ */

const lotesPag = { lotes: [], fincas: new Map(), productores: new Map(), listo: false };

async function iniciarLotes() {
  if (!exigirSesion()) return;
  mostrarEstado("cargando");
  const admin = esAdmin();
  try {
    await cargar(async () => {
      const [lotes, fincas, productores] = await Promise.all([
        todos("/lotes"),
        Api.modoDemo() ? Promise.resolve([]) : todos("/fincas"),
        admin ? todos("/productores") : Promise.resolve([]),
      ]);
      lotesPag.lotes = lotes;
      lotesPag.fincas = porId(fincas);
      lotesPag.productores = porId(productores);
    });
  } catch (e) { mostrarError(e); return; }
  mostrarEstado("datos");
  if (admin) {
    $("#t-lotes").textContent = "Lotes de todos los productores";
    $("#intro-lotes").textContent = "Como administrador ve los lotes de todos. Un lote que ya se comparó no se puede borrar: se marca como vendido.";
    $("#filtro-productor-campo").hidden = false;
    const sel = $("#filtro-productor");
    sel.length = 1;
    [...lotesPag.productores.values()].forEach((p) => sel.add(new Option(p.nombre_completo, p.id)));
  }
  const selF = $("#filtro-finca");
  selF.length = 1;
  [...lotesPag.fincas.values()].forEach((f) => selF.add(new Option(`${f.nombre}${admin ? ` · ${lotesPag.productores.get(f.productor_id)?.nombre_completo || ""}` : ""}`, f.id)));
  if (params.get("finca_id")) selF.value = params.get("finca_id");
  if (params.get("productor_id")) $("#filtro-productor").value = params.get("productor_id");
  $("#cabeza-lotes").innerHTML = `<th scope="col" class="izq">Lote</th>${admin ? '<th scope="col" class="izq">Productor</th>' : ""}<th scope="col" class="izq">Finca y origen</th><th scope="col">Animales</th><th scope="col">Peso total</th><th scope="col" class="izq">Estado</th><th scope="col">Simulaciones</th><th scope="col" class="izq">Acciones</th>`;
  pintarLotes();
  if (!lotesPag.listo) {
    lotesPag.listo = true;
    ["#filtro-productor", "#filtro-finca", "#filtro-estado"].forEach((s) => $(s).addEventListener("change", pintarLotes));
    $("#filtros-lotes").addEventListener("submit", (ev) => ev.preventDefault());
    $("#btn-nuevo-lote").addEventListener("click", () => editarLote(null));
    delegarAcciones($("#tabla-lotes"), {
      editar: (id) => editarLote(lotesPag.lotes.find((l) => l.id === id)),
      vendido: (id) => cambiarEstadoLote(id, "vendido"),
      disponible: (id) => cambiarEstadoLote(id, "disponible"),
      eliminar: eliminarLote,
    });
  }
}

function pintarLotes() {
  const admin = esAdmin();
  const fp = $("#filtro-productor").value;
  const ff = $("#filtro-finca").value;
  const fe = $("#filtro-estado").value;
  const visibles = lotesPag.lotes.filter((l) => (!fp || l.productor_id === fp) && (!ff || l.finca_id === ff) && (!fe || l.estado === fe));
  $("#conteo-lotes").textContent = `${visibles.length} de ${lotesPag.lotes.length} lotes.`;
  $("#tabla-lotes").innerHTML = visibles.map((l) => {
    const sims = l.simulaciones ?? 0;
    const acciones = [
      l.estado !== "vendido" ? `<a class="boton boton--peq" href="detalle.html?lote=${l.id}">Comparar</a>` : "",
      botonAccion("editar", l.id, "Editar"),
      l.estado === "vendido" ? botonAccion("disponible", l.id, "Volver a disponible") : botonAccion("vendido", l.id, "Marcar vendido"),
      sims ? "" : botonAccion("eliminar", l.id, "Eliminar"),
    ].join(" ");
    const finca = l.finca ? escapar(l.finca) : "Sin finca";
    return `<tr>
      <th scope="row" class="izq">${escapar(l.nombre)}<small>${escapar(animales(l.cantidad_animales, l.categoria))}${l.raza ? `, ${escapar(l.raza)}` : ""}</small></th>
      ${admin ? `<td class="izq">${escapar(lotesPag.productores.get(l.productor_id)?.nombre_completo || "—")}</td>` : ""}
      <td class="izq">${finca}<small>Sale de ${escapar(l.municipio_origen)}</small></td>
      <td>${l.cantidad_animales}</td>
      <td>${fmt.kg(l.peso_total_kg)}</td>
      <td class="izq">${insignia(ESTADOS_LOTE[l.estado], l.estado === "vendido" ? "" : (l.estado === "simulado" ? "ok" : "aviso"))}</td>
      <td>${sims ? `<a href="historial.html?lote=${l.id}">${sims}</a>` : "0"}</td>
      <td class="izq acciones-fila">${acciones}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="${admin ? 8 : 7}" class="izq">No hay lotes con estos filtros. <a href="detalle.html">Registre un lote y compárelo</a>.</td></tr>`;
}

function htmlLote(l = {}, fincas = [], productores = []) {
  const opcFincas = fincas.filter((f) => f.activo || f.id === l.finca_id).map((f) => [f.id, `${f.nombre} (${f.municipio})${f.activo ? "" : " · inactiva"}`]);
  return `<div class="campos">
    ${productores.length ? campo({ prefijo: "lote-", nombre: "productor_id", etiqueta: "Productor", tipo: "select", opciones: productores.map((p) => [p.id, p.nombre_completo]), vacio: "Seleccione el productor", ancho: true, atributos: "required" }) : ""}
    ${campo({ prefijo: "lote-", nombre: "nombre", etiqueta: "Nombre del lote", valor: l.nombre, ancho: true, atributos: 'required minlength="3" maxlength="80"' })}
    ${campo({ prefijo: "lote-", nombre: "finca_id", etiqueta: "Finca", tipo: "select", opciones: opcFincas, vacio: opcFincas.length ? "Seleccione la finca" : "No hay fincas: regístrela en Mi cuenta", valor: l.finca_id ?? (opcFincas.length === 1 ? opcFincas[0][0] : ""), ayuda: 'El municipio de origen sale de la finca. <a href="cuenta.html#fincas">Registrar una finca</a>.', atributos: "required" })}
    ${campo({ prefijo: "lote-", nombre: "categoria", etiqueta: "Categoría", tipo: "select", opciones: Object.entries(CATEGORIAS).map(([k, [uno]]) => [k, uno[0].toUpperCase() + uno.slice(1)]), vacio: "Seleccione", valor: l.categoria, atributos: "required" })}
    ${campo({ prefijo: "lote-", nombre: "cantidad_animales", etiqueta: "Cantidad de animales", tipo: "number", valor: l.cantidad_animales, atributos: 'required min="1" max="200" step="1" inputmode="numeric"' })}
    ${campo({ prefijo: "lote-", nombre: "peso_promedio_kg", etiqueta: "Peso promedio (kg)", tipo: "number", valor: l.peso_promedio_kg, atributos: 'required min="80" max="900" step="0.1" inputmode="decimal"' })}
    ${campo({ prefijo: "lote-", nombre: "raza", etiqueta: "Raza o cruce", valor: l.raza, opcional: true, atributos: 'maxlength="40"' })}
    ${l.id ? campo({ prefijo: "lote-", nombre: "estado", etiqueta: "Estado", tipo: "select", opciones: Object.entries(ESTADOS_LOTE), valor: l.estado }) : ""}
  </div>`;
}

function validarLote(d) {
  const e = [];
  if (d.productor_id === null) e.push(["productor_id", "Seleccione el productor."]);
  if (!d.nombre || d.nombre.length < 3) e.push(["nombre", "El nombre del lote debe tener al menos 3 letras."]);
  if (!d.finca_id) e.push(["finca_id", "Seleccione la finca de donde sale el lote."]);
  if (!d.categoria) e.push(["categoria", "Seleccione la categoría."]);
  if (!Number.isInteger(d.cantidad_animales) || d.cantidad_animales < 1 || d.cantidad_animales > 200) e.push(["cantidad_animales", "La cantidad debe ser un entero entre 1 y 200."]);
  if (!(d.peso_promedio_kg >= 80 && d.peso_promedio_kg <= 900)) e.push(["peso_promedio_kg", "El peso promedio debe estar entre 80 y 900 kg."]);
  return e;
}

async function editarLote(l) {
  const admin = esAdmin();
  const fincasDe = (pid) => [...lotesPag.fincas.values()].filter((f) => !pid || f.productor_id === pid);
  const r = await abrirFormulario({
    titulo: l ? `Editar ${l.nombre}` : "Nuevo lote",
    html: htmlLote(l || {}, fincasDe(l?.productor_id ?? (admin ? "-" : null)), !l && admin ? [...lotesPag.productores.values()] : []),
    validar: validarLote,
    alAbrir: (form) => {
      // El administrador elige primero el productor; la lista de fincas se ajusta a ese productor.
      const selP = $('[name="productor_id"]', form);
      selP?.addEventListener("change", () => {
        const opc = fincasDe(selP.value).filter((f) => f.activo).map((f) => [f.id, `${f.nombre} (${f.municipio})`]);
        $('[name="finca_id"]', form).innerHTML = opcionesHtml(opc, "", opc.length ? "Seleccione la finca" : "Ese productor no tiene fincas activas");
      });
    },
    alEnviar: async (d) => {
      if (l) {
        const cambios = soloCambios(d, l);
        return Object.keys(cambios).length ? Api.patch(`/lotes/${l.id}`, cambios) : l;
      }
      return Api.post("/lotes", d);
    },
  });
  if (!r) return;
  lotesPag.lotes = l ? lotesPag.lotes.map((x) => (x.id === r.id ? r : x)) : [r, ...lotesPag.lotes];
  pintarLotes();
  avisar("#aviso-lotes", l ? `<strong>${escapar(r.nombre)}</strong> actualizado.` : `<strong>${escapar(r.nombre)}</strong> registrado. <a href="detalle.html?lote=${r.id}">Compararlo ahora</a>.`, "ok");
}

async function cambiarEstadoLote(id, estado) {
  try {
    const r = await Api.patch(`/lotes/${id}`, { estado });
    lotesPag.lotes = lotesPag.lotes.map((x) => (x.id === id ? r : x));
    pintarLotes();
    avisar("#aviso-lotes", `${escapar(r.nombre)}: ${ESTADOS_LOTE[estado].toLowerCase()}.`, "ok");
  } catch (e) { avisar("#aviso-lotes", escapar(e.message), "alerta"); }
}

async function eliminarLote(id) {
  const l = lotesPag.lotes.find((x) => x.id === id);
  if (!(await confirmar(`¿Eliminar ${l.nombre}?`, "El lote no tiene simulaciones guardadas, así que se borra por completo.", "Eliminar"))) return;
  try {
    await Api.del(`/lotes/${id}`);
    lotesPag.lotes = lotesPag.lotes.filter((x) => x.id !== id);
    pintarLotes();
    avisar("#aviso-lotes", `${escapar(l.nombre)} eliminado.`, "ok");
  } catch (e) { avisar("#aviso-lotes", escapar(e.message), "alerta"); }
}

/* ------------------------------------------------------------------ */
/* Administración (admin.html)                                         */
/* ------------------------------------------------------------------ */

const adm = { usuarios: [], productores: [], destinos: [], rutas: new Map(), bitacora: { pagina: 1, datos: [] }, yo: null, listo: false };

async function iniciarAdmin() {
  if (!exigirSesion()) return;
  if (Api.modoDemo()) { mostrarError(new Error("La administración necesita la API conectada.")); return; }
  if (!esAdmin()) {
    mostrarError(new Error("Esta página es solo para administradores."));
    return;
  }
  mostrarEstado("cargando");
  try {
    adm.yo = await Api.get("/auth/yo");
    await pintarResumen();
  } catch (e) { mostrarError(e); return; }
  mostrarEstado("datos");
  if (!adm.listo) {
    adm.listo = true;
    conectarPestanas();
    const demorado = (fn) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, 300); }; };
    $("#u-q").addEventListener("input", demorado(cargarUsuarios));
    ["#u-rol", "#u-activo"].forEach((s) => $(s).addEventListener("change", cargarUsuarios));
    $("#p-q").addEventListener("input", demorado(cargarProductores));
    ["#p-tipo", "#p-verificado"].forEach((s) => $(s).addEventListener("change", cargarProductores));
    $$("#filtros-usuarios, #filtros-productores, #filtros-bitacora").forEach((f) => f.addEventListener("submit", (ev) => ev.preventDefault()));
    $("#b-recurso").addEventListener("change", () => cargarBitacora(true));
    $("#btn-mas-bitacora").addEventListener("click", () => cargarBitacora(false));
    $("#btn-nuevo-usuario").addEventListener("click", nuevoUsuario);
    $("#btn-nuevo-productor").addEventListener("click", () => editarProductor(null));
    $("#btn-nuevo-destino").addEventListener("click", () => editarDestino(null));
    delegarAcciones($("#tabla-usuarios"), {
      editar: editarUsuario, suspender: (id) => activarUsuario(id, false), reactivar: (id) => activarUsuario(id, true),
      temporal: restablecerContrasena, eliminar: eliminarUsuario,
    });
    delegarAcciones($("#tabla-solicitudes"), { atender: atenderSolicitud, descartar: descartarSolicitud });
    delegarAcciones($("#tabla-productores"), {
      editar: (id) => editarProductor(adm.productores.find((p) => p.id === id)),
      verificar: (id) => verificarProductor(id, true), desverificar: (id) => verificarProductor(id, false),
      eliminar: eliminarProductor,
    });
    delegarAcciones($("#tabla-destinos"), {
      editar: (id) => editarDestino(adm.destinos.find((d) => d.id === id)),
      activar: (id) => activarDestino(id, true), desactivar: (id) => activarDestino(id, false),
      ruta: editarRuta, eliminar: eliminarDestino,
    });
  }
  const pestana = (window.location.hash || "").slice(1);
  if (["usuarios", "productores", "destinos", "bitacora"].includes(pestana)) mostrarPestana(pestana);
}

function conectarPestanas() {
  const tabs = $$('.pestanas [role="tab"]');
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => mostrarPestana(t.id.replace("tab-", "")));
    t.addEventListener("keydown", (ev) => {
      const sig = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
      if (!sig) return;
      const otro = tabs[(i + sig + tabs.length) % tabs.length];
      otro.focus();
      mostrarPestana(otro.id.replace("tab-", ""));
    });
  });
}

const cargadores = { resumen: () => pintarResumen(), usuarios: () => cargarUsuarios(), productores: () => cargarProductores(), destinos: () => cargarDestinos(), bitacora: () => cargarBitacora(true) };

function mostrarPestana(nombre) {
  $$('.pestanas [role="tab"]').forEach((t) => {
    const activa = t.id === `tab-${nombre}`;
    t.setAttribute("aria-selected", String(activa));
    t.tabIndex = activa ? 0 : -1;
  });
  $$('.panel[role="tabpanel"]').forEach((p) => { p.hidden = p.id !== `panel-${nombre}`; });
  history.replaceState(null, "", `#${nombre}`);
  cargadores[nombre]?.().catch((e) => avisar("#aviso-admin", escapar(e.message), "alerta"));
}

/* ---------- Resumen ---------- */

async function pintarResumen() {
  const r = await Api.get("/admin/resumen");
  const tarjeta = (titulo, cifra, detalle, enlace) => `<div class="tarjeta">
    <h2>${escapar(titulo)}</h2><p class="tarjeta__cifra">${cifra}</p><p>${detalle}</p>${enlace ? `<p><a href="${enlace[0]}">${escapar(enlace[1])}</a></p>` : ""}</div>`;
  $("#tarjetas-resumen").innerHTML = [
    tarjeta("Cuentas", r.usuarios.total, `${r.usuarios.activos} activas, ${r.usuarios.suspendidos} suspendidas, ${r.usuarios.administradores} administradores.${r.usuarios.deben_cambiar_contrasena ? ` ${r.usuarios.deben_cambiar_contrasena} con contraseña temporal.` : ""}${r.usuarios.solicitudes_pendientes ? ` <strong>${r.usuarios.solicitudes_pendientes} ${r.usuarios.solicitudes_pendientes === 1 ? "solicitud" : "solicitudes"} de contraseña por atender.</strong>` : ""}`, ["#usuarios", r.usuarios.solicitudes_pendientes ? "Atender solicitudes" : "Administrar cuentas"]),
    tarjeta("Productores", r.productores.total, `${r.productores.personas} personas y ${r.productores.empresas} empresas. ${r.productores.verificados} verificados; ${r.productores.sin_documento} sin documento.`, ["#productores", "Revisar productores"]),
    tarjeta("Fincas y lotes", `${r.fincas} · ${r.lotes.total}`, `${r.fincas} fincas. Lotes: ${r.lotes.disponibles} disponibles, ${r.lotes.simulados} comparados, ${r.lotes.vendidos} vendidos.`, ["lotes.html", "Ver todos los lotes"]),
    tarjeta("Simulaciones", r.simulaciones.total, `${r.simulaciones.ultimos_7_dias} en los últimos 7 días.`, ["historial.html", "Ver historial"]),
    tarjeta("Destinos", r.destinos.activos, `${r.destinos.activos} activos y ${r.destinos.inactivos} inactivos.`, ["#destinos", "Administrar destinos"]),
    tarjeta("Precios", r.precios.ultima_fecha ? fmt.dia(r.precios.ultima_fecha) : "—",
      `Último precio cargado. ${r.precios.con_advertencia} con advertencia (más de 7 días) y ${r.precios.vencidos} vencidos (más de 30).`, ["precios.html", "Cargar precios de Fedegán"]),
  ].join("");
  $("#lista-mas-elegidos").innerHTML = r.destinos_mas_elegidos.map((d) => `<li>${escapar(d.nombre)}: ${d.veces} ${d.veces === 1 ? "vez" : "veces"}</li>`).join("")
    || "<li>Todavía no hay simulaciones.</li>";
  marcarSolicitudes(r.usuarios.solicitudes_pendientes);
  $$("#tarjetas-resumen a[href^='#']").forEach((a) => a.addEventListener("click", (ev) => { ev.preventDefault(); mostrarPestana(a.getAttribute("href").slice(1)); }));
}

/* ---------- Usuarios ---------- */

async function cargarUsuarios() {
  const q = new URLSearchParams();
  if ($("#u-q").value.trim()) q.set("q", $("#u-q").value.trim());
  if ($("#u-rol").value) q.set("rol", $("#u-rol").value);
  if ($("#u-activo").value) q.set("activo", $("#u-activo").value);
  const [usuarios, solicitudes] = await Promise.all([todos(`/usuarios?${q}`), todos("/solicitudes-contrasena?estado=pendiente")]);
  adm.usuarios = usuarios;
  adm.solicitudes = solicitudes;
  pintarUsuarios();
  pintarSolicitudes();
}

/** El número de solicitudes pendientes se ve en la pestaña Usuarios. */
function marcarSolicitudes(n) {
  const tab = $("#tab-usuarios");
  if (tab) tab.innerHTML = n ? `Usuarios <span class="insignia insignia--aviso">${n}<span class="sr-only"> solicitudes de contraseña</span></span>` : "Usuarios";
}

function pintarSolicitudes() {
  const lista = adm.solicitudes || [];
  $("#bloque-solicitudes").hidden = !lista.length;
  marcarSolicitudes(lista.length);
  $("#tabla-solicitudes").innerHTML = lista.map((s) => `<tr>
    <th scope="row" class="izq">${escapar(s.usuario.nombre_completo)}<small>${escapar(s.usuario.correo)}${s.usuario.activo ? "" : " · cuenta suspendida"}</small></th>
    <td class="izq">${escapar(s.usuario.numero_documento ? `${s.usuario.tipo_documento} ${s.usuario.numero_documento}` : "—")}</td>
    <td class="izq">${fmt.fechaHora(s.creado_en)}</td>
    <td class="izq acciones-fila">${botonAccion("atender", s.id, "Atender: dar contraseña temporal")} ${botonAccion("descartar", s.id, "Descartar")}</td>
  </tr>`).join("");
}

async function atenderSolicitud(id) {
  const s = adm.solicitudes.find((x) => x.id === id);
  if (!(await confirmar(`¿Dar una contraseña temporal a ${s.usuario.nombre_completo}?`,
    "Antes, confirme con la persona (por ejemplo, llamándola) que ella hizo la solicitud. Su contraseña actual dejará de servir.", "Generar contraseña", false))) return;
  try {
    const r = await Api.post(`/solicitudes-contrasena/${id}/atender`);
    await cargarUsuarios();
    await abrirFormulario({
      titulo: "Contraseña temporal",
      html: `<p>Entregue esta contraseña a <strong>${escapar(s.usuario.nombre_completo)}</strong> por un medio seguro. No se volverá a mostrar.</p>
        <p class="clave-temporal"><code>${escapar(r.contrasena_temporal)}</code></p>`,
      boton: "Listo",
    });
  } catch (e) { avisar("#aviso-admin", escapar(e.message), "alerta"); }
}

async function descartarSolicitud(id) {
  const s = adm.solicitudes.find((x) => x.id === id);
  if (!(await confirmar(`¿Descartar la solicitud de ${s.usuario.nombre_completo}?`, "Su contraseña no cambia. Úselo si la solicitud no la hizo el titular de la cuenta.", "Descartar"))) return;
  try {
    await Api.post(`/solicitudes-contrasena/${id}/descartar`);
    await cargarUsuarios();
    avisar("#aviso-admin", `Solicitud de ${escapar(s.usuario.nombre_completo)} descartada.`, "ok");
  } catch (e) { avisar("#aviso-admin", escapar(e.message), "alerta"); }
}

function pintarUsuarios() {
  $("#conteo-usuarios").textContent = `${adm.usuarios.length} ${adm.usuarios.length === 1 ? "cuenta" : "cuentas"}.`;
  $("#tabla-usuarios").innerHTML = adm.usuarios.map((u) => {
    const p = u.productor;
    const propia = u.id === adm.yo.id;
    const estado = !u.activo ? insignia("Suspendida", "vencido") : (u.debe_cambiar_contrasena ? insignia("Contraseña temporal", "aviso") : insignia("Activa", "ok"));
    const id = p ? `${p.tipo_persona === "juridica" ? "Empresa" : "Persona"} · ${escapar(textoDocumento(p))}${p.documento_verificado ? " ✓" : ""}` : "—";
    const acciones = [
      botonAccion("editar", u.id, "Editar"),
      propia ? "" : (u.activo ? botonAccion("suspender", u.id, "Suspender") : botonAccion("reactivar", u.id, "Reactivar")),
      propia ? "" : botonAccion("temporal", u.id, "Contraseña temporal"),
      propia ? "" : botonAccion("eliminar", u.id, "Eliminar"),
    ].join(" ");
    return `<tr>
      <th scope="row" class="izq">${escapar(u.nombre_completo)}${propia ? " (usted)" : ""}<small>${escapar(u.correo)}</small></th>
      <td class="izq">${ROLES[u.rol]}</td>
      <td class="izq">${id}${p?.representante_legal ? `<small>Rep. legal: ${escapar(p.representante_legal)}</small>` : ""}</td>
      <td class="izq">${p ? escapar(p.municipio) : "—"}${p?.vereda ? `<small>Vereda ${escapar(p.vereda)}</small>` : ""}</td>
      <td class="izq">${estado}</td>
      <td class="izq">${u.ultimo_ingreso ? fmt.fechaHora(u.ultimo_ingreso) : "Nunca"}</td>
      <td class="izq acciones-fila">${acciones}</td>
    </tr>`;
  }).join("") || '<tr><td colspan="7" class="izq">No hay cuentas con esos filtros.</td></tr>';
}

const usuarioPorId = (id) => adm.usuarios.find((u) => u.id === id);

async function nuevoUsuario() {
  const sugerida = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 56]).join("");
  const r = await abrirFormulario({
    titulo: "Nueva cuenta",
    html: `<div class="campos">
      ${campo({ prefijo: "nu-", nombre: "rol", etiqueta: "Rol", tipo: "select", opciones: Object.entries(ROLES), valor: "productor", ancho: true })}
      <div class="campos campo--ancho" id="nu-ficha">${htmlFicha("nu-", {}, { correo: true, contrasena: true, etiquetaContrasena: "Contraseña inicial" })}</div>
    </div>
    <p class="ayuda">La persona deberá cambiar la contraseña inicial la primera vez que ingrese. Entréguesela por un medio seguro.</p>`,
    alAbrir: (form) => {
      conectarFicha(form);
      $('[name="contrasena"]', form).value = `Bov-${sugerida}`;
      $('[name="contrasena"]', form).type = "text";
      const rol = $('[name="rol"]', form);
      const ajustar = () => {
        const prod = rol.value === "productor";
        ["tipo_persona", "representante_legal", "tipo_documento", "numero_documento", "municipio", "vereda", "telefono"].forEach((c) => {
          const el = form.querySelector(`[data-campo="${c}"]`);
          if (el) el.hidden = !prod || (c === "representante_legal" && form.querySelector('[name="tipo_persona"]:checked')?.value !== "juridica");
        });
      };
      rol.addEventListener("change", ajustar);
      ajustar();
    },
    validar: (d) => {
      if (d.rol === "productor") return validarFicha(limpiarFicha(d), { correo: true, contrasena: true });
      const e = [];
      if (!d.nombre_completo || d.nombre_completo.length < 3) e.push(["nombre_completo", "Escriba el nombre completo."]);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo || "")) e.push(["correo", "Escriba un correo válido."]);
      if ((d.contrasena || "").length < 10) e.push(["contrasena", "La contraseña inicial debe tener al menos 10 caracteres."]);
      return e;
    },
    alEnviar: async (d) => {
      const cuerpo = d.rol === "productor" ? limpiarFicha(d) : { rol: d.rol, nombre_completo: d.nombre_completo, correo: d.correo, contrasena: d.contrasena };
      Object.keys(cuerpo).forEach((k) => { if (cuerpo[k] === null) delete cuerpo[k]; });
      const u = await Api.post("/usuarios", cuerpo);
      return { u, contrasena: d.contrasena };
    },
  });
  if (!r) return;
  await cargarUsuarios();
  avisar("#aviso-admin", `Cuenta de <strong>${escapar(r.u.nombre_completo)}</strong> creada. Contraseña inicial: <code>${escapar(r.contrasena)}</code> (se le pedirá cambiarla al ingresar).`, "ok");
}

async function editarUsuario(id) {
  const u = usuarioPorId(id);
  const propia = u.id === adm.yo.id;
  const r = await abrirFormulario({
    titulo: `Editar cuenta de ${u.nombre_completo}`,
    html: `<div class="campos">
      ${campo({ prefijo: "eu-", nombre: "nombre_completo", etiqueta: "Nombre", valor: u.nombre_completo, atributos: 'required minlength="3" maxlength="120"' })}
      ${campo({ prefijo: "eu-", nombre: "correo", etiqueta: "Correo", tipo: "email", valor: u.correo, atributos: 'required maxlength="120"' })}
      ${campo({ prefijo: "eu-", nombre: "rol", etiqueta: "Rol", tipo: "select", opciones: Object.entries(ROLES), valor: u.rol,
    ayuda: propia ? "No puede cambiar el rol de su propia cuenta." : (u.productor_id ? "" : "Esta cuenta no tiene ficha de productor: solo puede ser administrador."),
    atributos: propia || !u.productor_id ? "disabled" : "" })}
    </div>${u.productor ? '<p class="ayuda">El nombre y el correo también cambian en la ficha del productor. Los demás datos de la ficha se editan en la pestaña Productores.</p>' : ""}`,
    validar: (d) => {
      const e = [];
      if (!d.nombre_completo || d.nombre_completo.length < 3) e.push(["nombre_completo", "Escriba el nombre."]);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo || "")) e.push(["correo", "Escriba un correo válido."]);
      return e;
    },
    alEnviar: async (d) => {
      const cambios = soloCambios(d, u);
      return Object.keys(cambios).length ? Api.patch(`/usuarios/${u.id}`, cambios) : u;
    },
  });
  if (!r) return;
  await cargarUsuarios();
  avisar("#aviso-admin", `Cuenta de <strong>${escapar(r.nombre_completo)}</strong> actualizada${r.rol !== u.rol ? `: ahora es ${ROLES[r.rol].toLowerCase()} (aplica de inmediato)` : ""}.`, "ok");
}

async function activarUsuario(id, activo) {
  const u = usuarioPorId(id);
  if (!activo && !(await confirmar(`¿Suspender a ${u.nombre_completo}?`,
    "La cuenta deja de funcionar de inmediato, incluso si tiene la sesión abierta. Sus lotes y simulaciones se conservan y puede reactivarla cuando quiera.", "Suspender"))) return;
  try {
    await Api.patch(`/usuarios/${id}`, { activo });
    await cargarUsuarios();
    avisar("#aviso-admin", `${escapar(u.nombre_completo)}: cuenta ${activo ? "reactivada" : "suspendida"}.`, "ok");
  } catch (e) { avisar("#aviso-admin", escapar(e.message), "alerta"); }
}

async function restablecerContrasena(id) {
  const u = usuarioPorId(id);
  if (!(await confirmar(`¿Dar una contraseña temporal a ${u.nombre_completo}?`, "La contraseña actual deja de servir. La persona deberá cambiar la temporal al ingresar.", "Generar contraseña", false))) return;
  try {
    const r = await Api.post(`/usuarios/${id}/contrasena-temporal`);
    await cargarUsuarios();
    await abrirFormulario({
      titulo: "Contraseña temporal",
      html: `<p>Entregue esta contraseña a <strong>${escapar(u.nombre_completo)}</strong> por un medio seguro. No se volverá a mostrar.</p>
        <p class="clave-temporal"><code>${escapar(r.contrasena_temporal)}</code></p>`,
      boton: "Listo",
      peligro: false,
    });
  } catch (e) { avisar("#aviso-admin", escapar(e.message), "alerta"); }
}

async function eliminarUsuario(id) {
  const u = usuarioPorId(id);
  if (!(await confirmar(`¿Eliminar la cuenta de ${u.nombre_completo}?`,
    "Solo se puede eliminar una cuenta sin lotes; se borran también su ficha y sus fincas. Si tiene lotes, suspéndala.", "Eliminar"))) return;
  try {
    await Api.del(`/usuarios/${id}`);
    await cargarUsuarios();
    avisar("#aviso-admin", `Cuenta de ${escapar(u.nombre_completo)} eliminada.`, "ok");
  } catch (e) { avisar("#aviso-admin", escapar(e.message), "alerta"); }
}

/* ---------- Productores ---------- */

async function cargarProductores() {
  const q = new URLSearchParams();
  if ($("#p-q").value.trim()) q.set("q", $("#p-q").value.trim());
  if ($("#p-tipo").value) q.set("tipo_persona", $("#p-tipo").value);
  if ($("#p-verificado").value) q.set("verificado", $("#p-verificado").value);
  adm.productores = await todos(`/productores?${q}`);
  pintarProductores();
}

function pintarProductores() {
  $("#conteo-productores").textContent = `${adm.productores.length} productores.`;
  $("#tabla-productores").innerHTML = adm.productores.map((p) => {
    const verif = p.documento_verificado ? insignia("Verificado", "ok") : (p.numero_documento ? insignia("Sin verificar", "aviso") : insignia("Sin documento", "vencido"));
    const acciones = [
      botonAccion("editar", p.id, "Editar"),
      p.numero_documento ? (p.documento_verificado ? botonAccion("desverificar", p.id, "Quitar verificación") : botonAccion("verificar", p.id, "Verificar documento")) : "",
      `<a class="boton boton--peq boton--secundario" href="lotes.html?productor_id=${p.id}">Lotes</a>`,
      botonAccion("eliminar", p.id, "Eliminar"),
    ].join(" ");
    return `<tr>
      <th scope="row" class="izq">${escapar(p.nombre_completo)}<small>${p.tipo_persona === "juridica" ? "Empresa" : "Persona"}</small></th>
      <td class="izq">${escapar(textoDocumento(p))} ${verif}${p.representante_legal ? `<small>Rep. legal: ${escapar(p.representante_legal)}</small>` : ""}</td>
      <td class="izq">${escapar(p.municipio)}, ${escapar(p.departamento)}${p.vereda ? `<small>Vereda ${escapar(p.vereda)}</small>` : ""}</td>
      <td class="izq">${escapar(p.correo || "—")}<small>${escapar(p.telefono || "")}</small></td>
      <td class="izq acciones-fila">${acciones}</td>
    </tr>`;
  }).join("") || '<tr><td colspan="5" class="izq">No hay productores con esos filtros.</td></tr>';
}

async function editarProductor(p) {
  const r = await abrirFormulario({
    titulo: p ? `Editar ficha de ${p.nombre_completo}` : "Nuevo productor sin cuenta",
    html: `<div class="campos">${htmlFicha("ep-", p || {}, { correo: true })}</div>
      <p class="ayuda">${p ? "Si cambia el documento, la ficha queda sin verificar." : "Para ganaderos que no usan la aplicación: el administrador registra sus lotes a su nombre."}</p>`,
    alAbrir: (form) => {
      conectarFicha(form);
      const correo = $('[name="correo"]', form);
      if (!p) correo.removeAttribute("required");
      const etiqueta = form.querySelector('[data-campo="correo"] label');
      if (etiqueta && !p) etiqueta.innerHTML = 'Correo <span class="opcional">(opcional)</span>';
    },
    validar: (d) => validarFicha(limpiarFicha(d), { correo: Boolean(p && d.correo !== null) }),
    alEnviar: async (d) => {
      const datos = limpiarFicha(d);
      if (p) {
        const cambios = soloCambios(datos, p);
        return Object.keys(cambios).length ? Api.patch(`/productores/${p.id}`, cambios) : p;
      }
      return Api.post("/productores", datos);
    },
  });
  if (!r) return;
  await cargarProductores();
  avisar("#aviso-admin", `Ficha de <strong>${escapar(r.nombre_completo)}</strong> ${p ? "actualizada" : "creada"}.`, "ok");
}

async function verificarProductor(id, valor) {
  const p = adm.productores.find((x) => x.id === id);
  if (valor && !(await confirmar(`¿Verificar el documento de ${p.nombre_completo}?`,
    `Confirme que revisó el ${escapar(textoDocumento(p))}${p.tipo_persona === "juridica" ? " en el RUT o el certificado de Cámara de Comercio" : " contra el documento original"}. Después, el productor ya no podrá cambiarlo.`, "Verificar", false))) return;
  try {
    await Api.patch(`/productores/${id}`, { documento_verificado: valor });
    await cargarProductores();
    avisar("#aviso-admin", `${escapar(p.nombre_completo)}: documento ${valor ? "verificado" : "sin verificar"}.`, "ok");
  } catch (e) { avisar("#aviso-admin", escapar(e.message), "alerta"); }
}

async function eliminarProductor(id) {
  const p = adm.productores.find((x) => x.id === id);
  if (!(await confirmar(`¿Eliminar a ${p.nombre_completo}?`, "Solo se puede eliminar un productor sin lotes y sin cuenta de usuario.", "Eliminar"))) return;
  try {
    await Api.del(`/productores/${id}`);
    await cargarProductores();
    avisar("#aviso-admin", `${escapar(p.nombre_completo)} eliminado.`, "ok");
  } catch (e) { avisar("#aviso-admin", escapar(e.message), "alerta"); }
}

/* ---------- Destinos y rutas ---------- */

async function cargarDestinos() {
  const [activos, inactivos, rutas] = await Promise.all([
    todos("/destinos"), todos("/destinos?activo=false"), Api.get(`/rutas?origen=${encodeURIComponent(ORIGEN_YOPAL)}`),
  ]);
  adm.destinos = [...activos, ...inactivos];
  adm.rutas = new Map(rutas.map((r) => [r.destino_id, r]));
  $("#tabla-destinos").innerHTML = adm.destinos.map((d) => {
    const r = adm.rutas.get(d.id);
    const ruta = d.tipo === "finca" ? "Sin viaje" : (r ? `${fmt.km(r.distancia_km)}, ${fmt.horas(r.tiempo_horas)}<small>Peajes ${fmt.cop(r.peajes_cop)} · merma ${fmt.pct(r.merma_pct)} · ${r.fuente === "osrm" ? "medida (OSRM)" : (r.fuente === "manual" ? "manual" : "estimada")}</small>` : "Se estima en la primera simulación");
    const acciones = [
      botonAccion("editar", d.id, "Editar"),
      r ? botonAccion("ruta", d.id, "Corregir ruta") : "",
      d.activo ? botonAccion("desactivar", d.id, "Desactivar") : botonAccion("activar", d.id, "Activar"),
      botonAccion("eliminar", d.id, "Eliminar"),
    ].join(" ");
    return `<tr>
      <th scope="row" class="izq">${escapar(d.nombre)}<small>${TIPOS[d.tipo]}</small></th>
      <td class="izq">${escapar(d.municipio)}, ${escapar(d.departamento)}</td>
      <td>${fmt.pct(d.comision_pct)}</td>
      <td class="izq">${ruta}</td>
      <td class="izq">${d.activo ? insignia("Activo", "ok") : insignia("Inactivo", "aviso")}</td>
      <td class="izq acciones-fila">${acciones}</td>
    </tr>`;
  }).join("");
}

async function editarDestino(d) {
  const [lon, lat] = d?.ubicacion?.coordinates || [];
  const r = await abrirFormulario({
    titulo: d ? `Editar ${d.nombre}` : "Nuevo destino",
    html: `<div class="campos">
      ${campo({ prefijo: "de-", nombre: "nombre", etiqueta: "Nombre", valor: d?.nombre, ancho: true, atributos: 'required minlength="3" maxlength="100"' })}
      ${campo({ prefijo: "de-", nombre: "tipo", etiqueta: "Tipo", tipo: "select", opciones: Object.entries(TIPOS), valor: d?.tipo || "subasta" })}
      ${campo({ prefijo: "de-", nombre: "comision_pct", etiqueta: "Comisión (%)", tipo: "number", valor: d?.comision_pct ?? 0, atributos: 'min="0" max="15" step="0.01" inputmode="decimal"' })}
      ${campo({ prefijo: "de-", nombre: "municipio", etiqueta: "Municipio", valor: d?.municipio, atributos: 'required minlength="2" maxlength="60"' })}
      ${campo({ prefijo: "de-", nombre: "departamento", etiqueta: "Departamento", valor: d?.departamento || "Casanare", atributos: 'required minlength="2" maxlength="60"' })}
      ${campo({ prefijo: "de-", nombre: "latitud", etiqueta: "Latitud", tipo: "number", valor: lat, atributos: 'required step="0.0001" min="-5" max="13" inputmode="decimal"' })}
      ${campo({ prefijo: "de-", nombre: "longitud", etiqueta: "Longitud", tipo: "number", valor: lon, atributos: 'required step="0.0001" min="-82" max="-66" inputmode="decimal"' })}
    </div>${d ? "" : '<p class="ayuda">La ruta desde cada municipio se estima en la primera simulación; luego puede corregirla. Cargue sus precios en Precios.</p>'}`,
    validar: (x) => {
      const e = [];
      if (!x.nombre || x.nombre.length < 3) e.push(["nombre", "Escriba el nombre del destino."]);
      if (!x.municipio) e.push(["municipio", "Escriba el municipio."]);
      if (!x.departamento) e.push(["departamento", "Escriba el departamento."]);
      if (!(x.comision_pct >= 0 && x.comision_pct <= 15)) e.push(["comision_pct", "La comisión debe estar entre 0 y 15 %."]);
      if (!(x.latitud >= -5 && x.latitud <= 13)) e.push(["latitud", "La latitud debe estar en Colombia (entre −5 y 13)."]);
      if (!(x.longitud >= -82 && x.longitud <= -66)) e.push(["longitud", "La longitud debe estar en Colombia (entre −82 y −66)."]);
      return e;
    },
    alEnviar: async (x) => {
      const { latitud, longitud, ...resto } = x;
      const cuerpo = { ...resto, ubicacion: { type: "Point", coordinates: [longitud, latitud] } };
      if (!d) return Api.post("/destinos", cuerpo);
      const cambios = soloCambios(cuerpo, d);
      if (latitud === lat && longitud === lon) delete cambios.ubicacion;
      return Object.keys(cambios).length ? Api.patch(`/destinos/${d.id}`, cambios) : d;
    },
  });
  if (!r) return;
  await cargarDestinos();
  avisar("#aviso-admin", `Destino <strong>${escapar(r.nombre)}</strong> ${d ? "actualizado" : 'creado. <a href="precios.html">Cargue sus precios</a> para que se pueda comparar'}.`, "ok");
}

async function activarDestino(id, activo) {
  const d = adm.destinos.find((x) => x.id === id);
  try {
    await Api.patch(`/destinos/${id}`, { activo });
    await cargarDestinos();
    avisar("#aviso-admin", `${escapar(d.nombre)} ${activo ? "vuelve a ofrecerse" : "ya no se ofrece en las comparaciones; las simulaciones guardadas no cambian"}.`, "ok");
  } catch (e) { avisar("#aviso-admin", escapar(e.message), "alerta"); }
}

async function eliminarDestino(id) {
  const d = adm.destinos.find((x) => x.id === id);
  if (!(await confirmar(`¿Eliminar ${d.nombre}?`, "Si el destino ya aparece en simulaciones guardadas no se puede eliminar; en ese caso desactívelo.", "Eliminar"))) return;
  try {
    await Api.del(`/destinos/${id}`);
    await cargarDestinos();
    avisar("#aviso-admin", `${escapar(d.nombre)} eliminado.`, "ok");
  } catch (e) {
    avisar("#aviso-admin", `${escapar(e.message)}${e.estado === 409 ? ` <button type="button" class="boton boton--peq" id="btn-desactivar-sugerido">Desactivarlo</button>` : ""}`, "alerta");
    $("#btn-desactivar-sugerido")?.addEventListener("click", () => activarDestino(id, false));
  }
}

async function editarRuta(destinoId) {
  const d = adm.destinos.find((x) => x.id === destinoId);
  const r = adm.rutas.get(destinoId);
  const guardada = await abrirFormulario({
    titulo: `Ruta Yopal → ${d.nombre}`,
    html: `<div class="campos">
      ${campo({ prefijo: "ru-", nombre: "distancia_km", etiqueta: "Distancia (km)", tipo: "number", valor: r.distancia_km, atributos: 'required min="0" max="3000" step="0.1"' })}
      ${campo({ prefijo: "ru-", nombre: "tiempo_horas", etiqueta: "Tiempo (horas)", tipo: "number", valor: r.tiempo_horas, atributos: 'required min="0" max="72" step="0.1"' })}
      ${campo({ prefijo: "ru-", nombre: "peajes_cop", etiqueta: "Peajes por camión (COP)", tipo: "number", valor: r.peajes_cop, atributos: 'required min="0" step="100"' })}
      ${campo({ prefijo: "ru-", nombre: "merma_pct", etiqueta: "Merma (%)", tipo: "number", valor: r.merma_pct, atributos: 'required min="0" max="15" step="0.1"' })}
      ${campo({ prefijo: "ru-", nombre: "factor_dificultad", etiqueta: "Factor de dificultad", tipo: "number", valor: r.factor_dificultad, ayuda: "1 = vía plana; hasta 2 = cordillera o trocha.", atributos: 'required min="1" max="2" step="0.01"' })}
    </div><p class="ayuda">Las simulaciones ya guardadas no cambian; las nuevas usan estos valores.</p>`,
    validar: (x) => {
      const e = [];
      if (!(x.distancia_km >= 0 && x.distancia_km <= 3000)) e.push(["distancia_km", "Entre 0 y 3.000 km."]);
      if (!(x.tiempo_horas >= 0 && x.tiempo_horas <= 72)) e.push(["tiempo_horas", "Entre 0 y 72 horas."]);
      if (!(x.peajes_cop >= 0)) e.push(["peajes_cop", "No puede ser negativo."]);
      if (!(x.merma_pct >= 0 && x.merma_pct <= 15)) e.push(["merma_pct", "Entre 0 y 15 %."]);
      if (!(x.factor_dificultad >= 1 && x.factor_dificultad <= 2)) e.push(["factor_dificultad", "Entre 1 y 2."]);
      return e;
    },
    alEnviar: async (x) => {
      const cambios = soloCambios(x, r);
      return Object.keys(cambios).length ? Api.patch(`/rutas/${r.id}`, { ...cambios, fuente: "manual" }) : r;
    },
  });
  if (!guardada) return;
  await cargarDestinos();
  avisar("#aviso-admin", `Ruta a ${escapar(d.nombre)} corregida.`, "ok");
}

/* ---------- Bitácora ---------- */

async function cargarBitacora(reiniciar) {
  if (reiniciar) adm.bitacora = { pagina: 1, datos: [] };
  const recurso = $("#b-recurso").value;
  const r = await Api.get(`/bitacora?por_pagina=50&pagina=${adm.bitacora.pagina}${recurso ? `&recurso=${recurso}` : ""}`);
  adm.bitacora.datos = adm.bitacora.datos.concat(r.datos);
  adm.bitacora.pagina += 1;
  $("#btn-mas-bitacora").hidden = adm.bitacora.datos.length >= r.total;
  const detalle = (e) => {
    const d = e.detalle || {};
    const partes = [];
    if (d.campos) partes.push(`campos: ${d.campos.join(", ")}`);
    if (d.de && d.a) partes.push(`de ${ROLES[d.de] || d.de} a ${ROLES[d.a] || d.a}`);
    ["nombre", "correo", "destino", "categoria", "fecha", "documento", "municipio", "origen"].forEach((k) => { if (d[k]) partes.push(String(d[k])); });
    if (d.precio_kg_cop) partes.push(fmt.cop(d.precio_kg_cop));
    if (d.filas !== undefined) partes.push(`${d.filas} filas: ${d.insertados} nuevas, ${d.actualizados} cambiadas`);
    return escapar(partes.join(" · "));
  };
  $("#tabla-bitacora").innerHTML = adm.bitacora.datos.map((e) => `<tr>
    <td class="izq">${fmt.fechaHora(e.creado_en)}</td>
    <td class="izq">${escapar(e.usuario_nombre || "Sistema")}</td>
    <td class="izq">${escapar(ACCIONES[e.accion] || e.accion)}</td>
    <td class="izq">${escapar(RECURSOS[e.recurso] || e.recurso)}</td>
    <td class="izq">${detalle(e)}</td>
  </tr>`).join("") || '<tr><td colspan="5" class="izq">Sin registros.</td></tr>';
}

/* ------------------------------------------------------------------ */
/* Precios: editar o borrar un precio (administrador)                   */
/* ------------------------------------------------------------------ */

async function editarPrecio(id) {
  const p = precios.vigentes.find((x) => x.id === id);
  const r = await abrirFormulario({
    titulo: `Precio de ${CATEGORIAS[p.categoria][0]} en ${p.destino.nombre}`,
    html: `<div class="campos">
      ${campo({ prefijo: "pr-", nombre: "precio_kg_cop", etiqueta: "Precio por kg (COP)", tipo: "number", valor: p.precio_kg_cop, atributos: 'required min="3000" max="30000" step="1"' })}
      ${campo({ prefijo: "pr-", nombre: "fecha", etiqueta: "Fecha", tipo: "date", valor: p.fecha, atributos: "required" })}
      ${campo({ prefijo: "pr-", nombre: "fuente", etiqueta: "Fuente", valor: p.fuente, ancho: true, atributos: 'required minlength="3" maxlength="120"' })}
      ${campo({ prefijo: "pr-", nombre: "referencia", etiqueta: "Referencia", valor: p.referencia, opcional: true, ancho: true, atributos: 'maxlength="160"' })}
    </div>`,
    validar: (x) => {
      const e = [];
      if (!Number.isInteger(x.precio_kg_cop) || x.precio_kg_cop < 3000 || x.precio_kg_cop > 30000) e.push(["precio_kg_cop", "El precio debe ser un entero entre 3.000 y 30.000 pesos por kilo."]);
      if (!x.fecha) e.push(["fecha", "Escriba la fecha del precio."]);
      if (!x.fuente || x.fuente.length < 3) e.push(["fuente", "Escriba la fuente (por ejemplo, Fedegán, reporte semanal)."]);
      return e;
    },
    alEnviar: async (x) => {
      const cambios = soloCambios(x, p);
      return Object.keys(cambios).length ? Api.patch(`/precios/${p.id}`, cambios) : p;
    },
  });
  if (r) await iniciarPrecios();
}

async function eliminarPrecio(id) {
  const p = precios.vigentes.find((x) => x.id === id);
  if (!(await confirmar("¿Eliminar este precio?", `${escapar(CATEGORIAS[p.categoria][0])} en ${escapar(p.destino.nombre)}, ${fmt.dia(p.fecha)}: ${fmt.cop(p.precio_kg_cop)}. Las simulaciones guardadas no cambian; las nuevas usarán el precio anterior, si lo hay.`, "Eliminar"))) return;
  await Api.del(`/precios/${id}`);
  await iniciarPrecios();
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
  const pagina = document.body.dataset.pagina;
  sesionAlDia();
  if (pagina === "ingreso") {
    conectarRegistro();
    $("#btn-olvido")?.addEventListener("click", olvidoContrasena);
    if (params.get("motivo") === "eliminada") avisar("#aviso-ingreso", "Su cuenta fue eliminada y sus datos personales borrados.");
  }
  if (pagina === "precios") {
    delegarAcciones($("#tabla-precios"), { "editar-precio": editarPrecio, "eliminar-precio": eliminarPrecio });
  }
  const inicio = { cuenta: iniciarCuenta, lotes: iniciarLotes, admin: iniciarAdmin }[pagina];
  if (!inicio) return;
  inicio();
  $("#btn-reintentar")?.addEventListener("click", inicio);
});
