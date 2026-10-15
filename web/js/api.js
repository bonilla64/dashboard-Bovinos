/* Simulador de Destinos Ganaderos · cliente de la API (Entrega 3)
 *
 * Todo lo que el tablero lee o guarda pasa por aquí: dirección de la API, sesión (token JWT)
 * y la forma única de los errores { codigo, mensaje, detalles } definida en api/openapi.yaml.
 *
 * Dirección de la API, en este orden:
 *   1. ?api=https://servidor/api/v1 en la URL (queda guardada en este navegador).
 *   2. La que se guardó en «Ingresar → Conexión con el servidor».
 *   3. Codespaces: la misma dirección con el puerto 3000 en vez de 8080.
 *   4. localhost / red local: http://<mismo-equipo>:3000/api/v1.
 *   5. La escrita en js/config.js: la API publicada en internet (la usa GitHub Pages).
 * Si no hay ninguna (GitHub Pages sin API publicada todavía), el tablero abre en «modo demostración»:
 * solo lectura, con los datos exportados en datos/ejemplo.json.
 */
"use strict";

(function () {
  const CLAVE_API = "sdg.api";
  const CLAVE_SESION = "sdg.sesion";
  const PREFIJO = "/api/v1";

  function leer(clave, almacen = window.localStorage) {
    try { return almacen.getItem(clave); } catch (e) { return null; }
  }
  function escribir(clave, valor, almacen = window.localStorage) {
    try {
      if (valor === null) almacen.removeItem(clave); else almacen.setItem(clave, valor);
      return true;
    } catch (e) { return false; }
  }

  function normalizarBase(texto) {
    if (!texto) return null;
    let url;
    try { url = new URL(texto.trim()); } catch (e) { return null; }
    if (!/^https?:$/.test(url.protocol)) return null;
    let ruta = url.pathname.replace(/\/+$/, "");
    if (!ruta.endsWith(PREFIJO)) ruta += PREFIJO;
    return `${url.origin}${ruta}`;
  }

  function baseDetectada() {
    const { protocol, hostname } = window.location;
    const codespace = hostname.match(/^(.*)-\d+(\.app\.github\.dev)$/);
    if (codespace) return `https://${codespace[1]}-3000${codespace[2]}${PREFIJO}`;
    if (protocol === "file:") return `http://localhost:3000${PREFIJO}`;
    const local = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;
    if (local.test(hostname)) return `${protocol}//${hostname}:3000${PREFIJO}`;
    return null;
  }

  // ?api=... en la URL se guarda para las páginas siguientes.
  const desdeUrl = new URLSearchParams(window.location.search).get("api");
  if (desdeUrl) {
    const n = normalizarBase(desdeUrl);
    if (n) escribir(CLAVE_API, n);
  }

  function base() {
    return normalizarBase(leer(CLAVE_API)) || baseDetectada() || normalizarBase(window.SDG_CONFIG?.api);
  }

  /* ---------------- Sesión ---------------- */

  function sesion() {
    const texto = leer(CLAVE_SESION, window.sessionStorage) || leer(CLAVE_SESION);
    if (!texto) return null;
    try {
      const s = JSON.parse(texto);
      if (!s.token || !s.usuario || Date.now() > s.expira) { cerrarSesion(); return null; }
      return s;
    } catch (e) { return null; }
  }

  function guardarSesion(respuesta) {
    const s = { token: respuesta.token, usuario: respuesta.usuario, expira: Date.now() + respuesta.expira_en * 1000 };
    // localStorage para que la sesión sirva en otras pestañas; si falla, al menos en esta.
    if (!escribir(CLAVE_SESION, JSON.stringify(s))) escribir(CLAVE_SESION, JSON.stringify(s), window.sessionStorage);
    return s;
  }

  function cerrarSesion() {
    escribir(CLAVE_SESION, null);
    escribir(CLAVE_SESION, null, window.sessionStorage);
  }

  function irAIngreso(motivo) {
    const aqui = window.location.pathname.split("/").pop() + window.location.search;
    const q = new URLSearchParams({ volver: aqui || "index.html" });
    if (motivo) q.set("motivo", motivo);
    window.location.href = `ingreso.html?${q}`;
  }

  /* ---------------- Errores ---------------- */

  class ErrorApi extends Error {
    constructor(estado, cuerpo) {
      super(cuerpo?.mensaje || `El servidor respondió con el código ${estado}.`);
      this.estado = estado;
      this.codigo = cuerpo?.codigo || (estado === 0 ? "SIN_CONEXION" : "ERROR_INTERNO");
      this.detalles = Array.isArray(cuerpo?.detalles) ? cuerpo.detalles : [];
    }
  }

  /* ---------------- Peticiones ---------------- */

  async function pedir(metodo, ruta, { cuerpo, tipo = "application/json", publica = false, redirigir = true } = {}) {
    if (modoDemo()) return demo.pedir(metodo, ruta);
    const s = sesion();
    if (!publica && !s) {
      if (redirigir) irAIngreso("sesion");
      throw new ErrorApi(401, { codigo: "NO_AUTENTICADO", mensaje: "Debe iniciar sesión." });
    }
    const cabeceras = { Accept: "application/json" };
    if (s) cabeceras.Authorization = `Bearer ${s.token}`;
    let datos;
    if (cuerpo !== undefined) {
      cabeceras["Content-Type"] = tipo;
      datos = tipo === "application/json" ? JSON.stringify(cuerpo) : cuerpo;
    }
    let respuesta;
    // Los servicios gratuitos «duermen» sin uso: la primera petición puede tardar hasta un minuto.
    const lento = setTimeout(() => avisoLento(true), 4000);
    try {
      respuesta = await fetch(base() + ruta, { method: metodo, headers: cabeceras, body: datos });
    } catch (e) {
      throw new ErrorApi(0, {
        codigo: "SIN_CONEXION",
        mensaje: `No hubo respuesta de la API en ${base()}. Revise que el servidor esté encendido y la conexión a internet.`,
      });
    } finally {
      clearTimeout(lento);
      avisoLento(false);
    }
    if (respuesta.status === 204) return null;
    let json = null;
    try { json = await respuesta.json(); } catch (e) { /* respuesta sin cuerpo JSON */ }
    if (!respuesta.ok) {
      const error = new ErrorApi(respuesta.status, json);
      if (respuesta.status === 401 && !publica) {
        cerrarSesion();
        if (redirigir) irAIngreso("vencida");
      }
      throw error;
    }
    return json;
  }

  function avisoLento(mostrar) {
    let el = document.getElementById("aviso-lento");
    if (!mostrar) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement("p");
      el.id = "aviso-lento";
      el.className = "aviso aviso--flotante";
      el.setAttribute("role", "status");
      el.textContent = "El servidor se está despertando. La primera consulta del día puede tardar hasta un minuto…";
      document.body.append(el);
    }
    el.hidden = false;
  }

  /* ---------------- Modo demostración (GitHub Pages sin API) ---------------- */

  function modoDemo() { return !base(); }

  const demo = {
    datos: null,
    async cargar() {
      if (!this.datos) {
        const r = await fetch("datos/ejemplo.json", { cache: "no-cache" });
        if (!r.ok) throw new ErrorApi(r.status, null);
        this.datos = await r.json();
      }
      return this.datos;
    },
    async pedir(metodo, rutaCompleta) {
      if (metodo !== "GET") {
        throw new ErrorApi(503, {
          codigo: "SOLO_LECTURA",
          mensaje: "Esta es la versión de demostración, sin servidor: puede mirar, pero no guardar. Conecte la API en «Ingresar» para registrar lotes y calcular.",
        });
      }
      const d = await this.cargar();
      const [ruta, consulta] = rutaCompleta.split("?");
      const q = new URLSearchParams(consulta || "");
      const pagina = (lista) => {
        const pp = Number(q.get("por_pagina") || 20);
        const p = Number(q.get("pagina") || 1);
        return { datos: lista.slice((p - 1) * pp, p * pp), pagina: p, por_pagina: pp, total: lista.length };
      };
      const partes = ruta.split("/").filter(Boolean);
      const buscar = (lista, id) => {
        const x = lista.find((e) => e.id === id);
        if (!x) throw new ErrorApi(404, { codigo: "NO_ENCONTRADO", mensaje: "No existe en los datos de demostración." });
        return x;
      };
      switch (partes[0]) {
        case "simulaciones":
          if (partes[1]) return buscar(d.simulaciones, partes[1]);
          return pagina(d.simulaciones.filter((s) => !q.get("lote_id") || s.lote_id === q.get("lote_id")));
        case "lotes": return partes[1] ? buscar(d.lotes, partes[1]) : pagina([...d.lotes].reverse());
        case "productores": return partes[1] ? buscar(d.productores, partes[1]) : pagina(d.productores);
        case "destinos":
          if (partes[2] === "precios") return d.precios.filter((p) => p.destino_id === partes[1]);
          return partes[1] ? buscar(d.destinos, partes[1]) : pagina(d.destinos);
        case "rutas": return d.rutas.filter((r) => !q.get("origen") || r.origen_nombre === q.get("origen"));
        default:
          throw new ErrorApi(503, { codigo: "SOLO_LECTURA", mensaje: "Disponible solo con la API conectada." });
      }
    },
  };

  window.Api = {
    base,
    normalizarBase,
    guardarBase(texto) {
      if (!texto) { escribir(CLAVE_API, null); return base(); }
      const n = normalizarBase(texto);
      if (!n) return null;
      escribir(CLAVE_API, n);
      return n;
    },
    modoDemo,
    sesion,
    guardarSesion,
    cerrarSesion,
    irAIngreso,
    ErrorApi,
    pedir,
    get: (ruta, op) => pedir("GET", ruta, op),
    post: (ruta, cuerpo, op) => pedir("POST", ruta, { ...op, cuerpo }),
    patch: (ruta, cuerpo, op) => pedir("PATCH", ruta, { ...op, cuerpo }),
    del: (ruta, op) => pedir("DELETE", ruta, op),
    async ingresar(correo, contrasena) {
      const r = await pedir("POST", "/auth/ingreso", { cuerpo: { correo, contrasena }, publica: true, redirigir: false });
      return guardarSesion(r);
    },
    async registrar(datos) {
      const r = await pedir("POST", "/auth/registro", { cuerpo: datos, publica: true, redirigir: false });
      return guardarSesion(r);
    },
    salud: () => pedir("GET", "/salud", { publica: true, redirigir: false }),
  };
})();
