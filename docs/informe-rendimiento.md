# Informe de rendimiento con Lighthouse

Simulador de Destinos Ganaderos desde Yopal · Entrega 4

## Cómo se midió

- **Fecha:** 11 de noviembre de 2026.
- **Sitio:** https://bonilla64.github.io/dashboard-Bovinos/, con la versión 0.5.0 de la API en Render.
- **Herramienta:** Lighthouse en las DevTools de Brave (Chromium), en una ventana privada y sin extensiones.
- **Sesión:** se inició sesión como administrador y se desmarcó «Clear storage», para que Lighthouse midiera cada página con sus datos y no la redirección al ingreso.
- **Modos:** dos modos para comparar.
  - **Mobile:** emula un Moto G Power con red 4G lenta y CPU 4× más lenta.
  - **Desktop:** sin limitación de red ni de CPU.
- **Cálculo del puntaje de Performance:** promedio ponderado de TBT (30 %), LCP (25 %), CLS (25 %), FCP (10 %) y SI (10 %). Fuente: https://developer.chrome.com/docs/lighthouse/performance/performance-scoring?hl=es-419

## Resultados

| Página | Performance móvil | Performance escritorio | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|---|
| Ingreso (`ingreso.html`) | 95 | 74 | 100 | 100 | 100 |
| Tablero (`index.html`) | 90 | 74 | 100 | 100 | 100 |
| Registrar lote (`detalle.html`) | 85 | 89 | 100 | 100 | 100 |
| Historial (`historial.html`) | 99 | 86 | 100 | 100 | 100 |
| Lotes (`lotes.html`) | 80 | 89 | 100 | 100 | 100 |
| Mi cuenta (`cuenta.html`) | 89 | 92 | 100 | 100 | 100 |
| Administración (`admin.html`) | 87 | 94 | 100 | 100 | 100 |

Capturas de cada medición: [`docs/evidencias/entrega4/`](evidencias/entrega4/README.md#4-informe-de-lighthouse).

## Promedio

| Modo | Performance promedio (7 páginas) | Otras tres categorías |
|---|---|---|
| Móvil | 89,3 | 100 |
| Escritorio | 85,4 | 100 |

## Análisis

1. **Accesibilidad, buenas prácticas y SEO dan 100 en todas las páginas y en los dos modos.** Esto viene de las decisiones de las entregas anteriores:
   - HTML semántico.
   - Etiquetas en todos los campos.
   - Contraste suficiente.
   - `lang="es"` y `meta description`.
   - HTTPS en la página y en la API.
   - Ningún error en la consola.
2. **Las páginas que casi no dependen de datos son las más rápidas.**
   - Ingreso: 95 en móvil.
   - Mi cuenta: 89 en móvil y 92 en escritorio.

   Son HTML y CSS estáticos servidos por la CDN de GitHub Pages.
3. **Las páginas que esperan a la API bajan el puntaje.**
   - Lotes y Administración arman tablas y tarjetas con lo que responde Render.
   - El Tablero, además, carga el mapa de Leaflet con teselas de OpenStreetMap, y es la página más pesada: 74 en escritorio.

   El LCP depende del tiempo de respuesta de la API, que corre en el plan gratuito de Render y de la base en Neon.
4. **El CLS castiga los avisos que aparecen después de cargar.** Ingreso dio 74 en escritorio con el CLS en rojo. La medición se hizo con la sesión abierta, y el aviso «Ya inició sesión como…» se inserta arriba cuando el JavaScript lee la sesión, lo que empuja los formularios hacia abajo. Sin sesión (móvil) dio 95.
5. **Hay variación entre mediciones.** Por ejemplo, Historial dio 99 en móvil y 86 en escritorio, y el Tablero 90 y 74, aunque escritorio no tiene limitación. La razón es que el tiempo de respuesta de la API cambia de una solicitud a otra, y Lighthouse mide una sola carga. Para la próxima medición conviene correr cada página tres veces y tomar la mediana.

## Mejoras propuestas

| # | Mejora | Métrica que mejora | Esfuerzo |
|---|---|---|---|
| 1 | Cargar Leaflet y el mapa en diferido (`defer` o al hacer scroll) en el Tablero | TBT, LCP | Bajo |
| 2 | Reservar el espacio de avisos, tablas y tarjetas antes de que lleguen los datos (esqueleto de carga), empezando por el aviso de sesión en Ingreso | CLS | Bajo |
| 3 | Agregar `Cache-Control` a las respuestas de solo lectura de la API (destinos, precios) | LCP | Bajo |
| 4 | Evitar que la API de Render se duerma (por ejemplo, un ping programado) | LCP, primera carga | Bajo |
| 5 | Paginar la tabla de Lotes cuando pase de unas decenas de filas | TBT, SI | Medio |
