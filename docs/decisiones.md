# Decisiones de arquitectura

Registro de las decisiones del proyecto y su porqué. Cada decisión nueva se agrega al final con el siguiente número; una decisión reemplazada no se borra, se marca como «Reemplazada por D-xx».

Formato: contexto, decisión, alternativas descartadas y consecuencias.

---

## D-01 · Aplicación web en lugar de aplicación de escritorio

**Contexto.** La primera versión del proyecto (`core.py`) era una aplicación de escritorio en Python con CustomTkinter. La guía del curso exige una aplicación web con ruta de profundización.

**Decisión.** Se reconstruye como aplicación web. De la versión de escritorio se conserva la lógica de negocio: la consulta de rutas a OSRM, los destinos, los peajes estimados, el factor de dificultad de la vía y la advertencia sobre la merma de peso. El código de escritorio queda en la etiqueta `v0.1.0-escritorio` y sale de la rama `main`.

**Consecuencias.** El productor puede usar la herramienta desde el celular sin instalar nada, que es la condición de uso real en finca.

## D-02 · Ruta H: visualización de datos y web geoespacial

**Contexto.** En el formato de conformación el equipo marcó la Ruta D (API-first) como primera opción y la Ruta H como segunda. En la Entrega 1 se invirtieron.

**Decisión.** Ruta H. La pregunta del usuario es territorial y comparativa («¿a cuál de estos lugares me conviene llevar el ganado?») y se responde mejor viendo las rutas en un mapa junto a una tabla y un gráfico que se filtran entre sí.

**Alternativa descartada.** Ruta D como ruta principal. Varias de sus prácticas se adoptan igual: contrato primero (D-05) y validación automática del contrato en CI.

## D-03 · PostgreSQL 16 con PostGIS 3

**Decisión y porqué.** Ver `modelo-datos.md`, sección «Motor elegido». En resumen: geometrías y filtros espaciales nativos (`ST_DWithin`, `ST_AsGeoJSON`), integridad referencial entre simulación, resultado, destino y ruta, y restricciones `CHECK` que repiten en la base las reglas de la API.

**Alternativa descartada.** MongoDB: tiene índices geoespaciales, pero dejaría la integridad del historial de simulaciones a cargo del código de la aplicación.

## D-04 · Prototipo estático con datos en JSON y Leaflet incluido en el repositorio

**Contexto.** La Entrega 2 pide un prototipo navegable sin backend.

**Decisión.**
- HTML, CSS y JavaScript sin frameworks ni paso de compilación. Se abre con cualquier servidor estático y se publica en GitHub Pages.
- Los datos salen de `web/datos/ejemplo.json`, que tiene exactamente la forma de las respuestas de la API. En la Entrega 3 solo cambia la función `cargarDatos()` de `app.js`.
- El mapa usa Leaflet 1.9.4 copiado en `web/vendor/leaflet/` (unos 150 KB), no desde un CDN. Si la conexión rural es mala, el mapa funciona aunque el CDN no responda; solo el fondo de OpenStreetMap depende de internet, y si falla la interfaz lo dice y la tabla sigue funcionando.

**Alternativa descartada por ahora.** MapLibre GL con teselas vectoriales. Se reserva para la Entrega 5, cuando el historial crezca y haga falta (hito de rendimiento de la Ruta H). Para diez rutas, Leaflet es más liviano y más simple.

## D-05 · Contrato primero, recursos REST en español

**Decisión.** El contrato `api/openapi.yaml` se escribe antes que el código y es la fuente de verdad. Reglas:
- Recursos en plural y en español, iguales a las tablas: `/productores`, `/lotes`, `/destinos`, `/rutas`, `/simulaciones`.
- Los precios se anidan bajo su destino (`/destinos/{destino_id}/precios`) porque un precio no tiene sentido sin su destino.
- `POST /simulaciones` calcula y guarda en un solo paso. El cliente nunca envía resultados calculados: así nadie puede guardar una utilidad inventada.
- Los listados grandes se paginan (`pagina`, `por_pagina`). `precios` y `rutas` no se paginan porque son pocos registros por destino.
- `DELETE /lotes/{id}` responde 409 si el lote ya tiene simulaciones: se marca como vendido en lugar de borrarlo, para no romper el historial.

## D-06 · Fórmula de utilidad con merma de peso y factor de dificultad

**Contexto.** La fórmula del anteproyecto era `Utilidad = PT × V − (D × F + T)`. Con ella, el destino más lejano con mejor precio (Medellín) gana casi siempre, porque no se descuenta el peso que pierden los animales en viajes largos. La versión de escritorio ya advertía una merma del 4 % al 7 %.

**Decisión.**
```
peso_vendido_kg     = peso_total_kg × (1 − merma_pct / 100)
flete_cop           = distancia_km × flete_km_cop × factor_dificultad
costo_logistico_cop = flete_cop + peajes_cop
ingreso_bruto_cop   = peso_vendido_kg × precio_kg_cop
utilidad_neta_cop   = ingreso_bruto_cop − costo_logistico_cop
```
`merma_pct` y `factor_dificultad` son propiedades de la ruta.

**Consecuencias.** Con los datos de ejemplo, Bogotá queda primero para un lote de 30 novillos y vender en Yopal queda muy cerca, lo que coincide mejor con la práctica regional. **Pendiente:** validar los porcentajes de merma con al menos un ganadero o comerciante (ver «Validaciones pendientes»).

## D-07 · Autenticación diferida a la Entrega 3

**Decisión.** El contrato de la Entrega 2 declara `security: []`. En la Entrega 3 se agrega un esquema bearer (JWT) para las operaciones de escritura y la tabla `usuario` con su relación a `productor`, en el mismo pull request que actualice el contrato y el modelo.

## D-08 · Los resultados de una simulación guardan copia de los valores usados

**Decisión.** `resultado_simulacion` guarda distancia, tiempo, merma, precio, flete y peajes del momento del cálculo, aunque existan en `ruta` y `precio_mercado`.

**Porqué.** El historial debe mostrar con qué precio se tomó la decisión. Si el precio del frigorífico cambia mañana, la simulación del 14 de septiembre no puede cambiar. En la interfaz, abrir una simulación del historial muestra ese aviso y ofrece recalcular con precios actuales.

## D-09 · Un solo esquema de error y códigos de estado

**Decisión.** Todo error responde `{ codigo, mensaje, detalles[] }`. `codigo` es estable y en mayúsculas para que el cliente decida qué mostrar; `mensaje` está en español para el usuario final; `detalles` lista los campos con problema.

| Código HTTP | `codigo` | Cuándo |
|---|---|---|
| 400 | `PETICION_INVALIDA` | JSON mal formado, parámetro con tipo equivocado, UUID mal escrito |
| 404 | `NO_ENCONTRADO` | El recurso no existe |
| 409 | `CONFLICTO` | Precio repetido para destino + categoría + fecha; borrar un lote con simulaciones |
| 422 | `VALIDACION_FALLIDA` | JSON válido que incumple reglas de negocio (rangos, destino sin precio) |
| 503 | `SERVICIO_EXTERNO_NO_DISPONIBLE` | OSRM o Google Routes no responden (Entrega 3) |

## D-10 · Dinero en pesos enteros y geometrías en GeoJSON

**Decisión.** Los valores en pesos son enteros (`integer`), sin decimales, para evitar errores de redondeo. Las geometrías viajan en GeoJSON con `[longitud, latitud]` en EPSG:4326, el formato que leen directamente PostGIS y Leaflet.

## D-11 · Accesibilidad como requisito de diseño, no como revisión final

**Decisión.**
- Tipografía Atkinson Hyperlegible, diseñada para lectores con baja visión, con respaldo en fuentes del sistema.
- Paleta con contraste AA verificado en todos los pares de texto; el dorado de «mejor destino» se usa solo como relleno, nunca como color de texto.
- El mapa siempre tiene alternativa: la tabla y el gráfico de barras muestran lo mismo y son la vía de uso con teclado. Las rutas dibujadas se sacan del orden de tabulación para no crear decenas de paradas inútiles.
- Los errores del formulario se dicen con texto y un resumen con enlaces a cada campo, no solo con color.

## D-12 · Publicación en GitHub Pages mediante GitHub Actions

**Contexto.** La guía indica publicar la carpeta `/web`, pero la publicación de GitHub Pages por rama solo acepta la raíz o `/docs`.

**Decisión.** El workflow `.github/workflows/pages.yml` publica `web/` en cada push a `main`. En Settings → Pages se elige la fuente «GitHub Actions».

---

## Validaciones pendientes con usuarios reales

| Dato | Valor actual en el prototipo | A quién preguntar |
|---|---|---|
| Merma de peso por destino | 0,5 % (Yopal) a 7 % (Medellín) | Ganadero o comerciante que despache a varios destinos |
| Valor del flete por km | 6.500 COP por camión | Transportador de ganado de Yopal |
| Peajes por ruta | Estimados del equipo | Transportador; luego Google Routes |
| Precio por kg por destino | Estimaciones ilustrativas | Subasta de Yopal, compradores de frigorífico |
| Qué destinos se usan de verdad | 10 destinos | Ganadero |
