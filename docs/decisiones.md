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

| Dato | Valor actual en la API (v0.3.0) | Estado | A quién preguntar |
|---|---|---|---|
| Merma de peso por destino | 0,5 % (Yopal) a 9,5 % (Medellín); 7,7 % a Bogotá | Ajustado con la entrevista del 29 sep (D-13) | Confirmar con un segundo ganadero |
| Animales por camión | 25 por defecto (configurable de 5 a 40) | Dato de la entrevista (24 a 27) | — |
| Valor del flete por km | 6.500 COP por camión (lo escribe el usuario) | Pendiente | Transportador de ganado de Yopal |
| Comisión de subasta | 3 % | Estimación del equipo | Subasta Ganadera de Yopal |
| Peajes por ruta | Estimados del equipo, por camión | Pendiente | Transportador; luego Google Routes |
| Precio por kg por destino | Estimados, calibrados con OPCA-Unicórdoba (jun 2026) | Parcial | Boletines semanales de la subasta |
| Precio en finca | 10.100 (gordo) y 12.000 (levante) COP/kg | Levante dado por el ganadero | Más ganaderos que vendan en finca |

---

## D-13 · Ajustes al modelo tras la entrevista con un ganadero

**Contexto.** El 29 de septiembre de 2026 entrevistamos a un ganadero de Yopal, Casanare, que vende directamente en finca. No pudo darnos todos los valores (flete por kilómetro, peajes exactos), pero sus respuestas contradicen varios supuestos del prototipo.

**Lo que encontramos:**

| Respuesta del ganadero | Supuesto del prototipo | Ajuste |
|---|---|---|
| Vende en finca, directo al comprador, para no pagar transporte | No existe la opción de venta en finca | Agregar el destino base «venta en finca»: sin flete, sin peajes, sin merma |
| Los animales pierden 30 a 40 kg en viajes largos (Bogotá, Villavicencio) | Merma de 3 % a 4,5 % hacia esos destinos | Subir la merma a un 7 % – 9 % en viajes largos; calcularla en kg por animal, no solo en porcentaje |
| Macho de levante a $12.000/kg en pie | Sin precios de novillo de levante; novillo gordo entre $10.250 y $11.600 | Agregar precios de levante y revisar los de las demás categorías con la subasta |
| Caben 24 a 27 animales por camión | Un solo camión por lote | Calcular camiones = cantidad ÷ capacidad, redondeado hacia arriba, y multiplicar el flete |
| Los peajes los paga el transportador | Peajes sumados aparte del flete | Permitir indicar si el flete ya incluye peajes, para no cobrarlos dos veces |
| Para confiar, el cálculo debe incluir la comisión de la subasta | Sin comisión | Agregar `comision_pct` a los destinos de tipo subasta |
| Lo usaría en el celular | Diseño pensado primero para celular | Se mantiene |

**Impacto.** Con la merma que reportó (35 kg por animal, 7,7 % sobre 452 kg), el ejemplo del tablero cambia de resultado: Frigorífico Guadalupe pasa de $143,1 millones a $138,2 millones y vender en Yopal ($140,3 millones) queda como mejor opción. Esto coincide con su práctica de vender cerca.

**Decisión.** Los valores del prototipo de la Entrega 2 no se modifican, para mantener la coherencia entre el contrato, el modelo y las evidencias ya entregadas. Los ajustes se implementan en la Entrega 3, junto con la API, y quedan como tareas en el tablero.

**Pendiente:** conseguir el valor del flete por viaje o por kilómetro con un transportador, y la comisión de la Subasta de Yopal.

---

## D-14 · Pila del backend: Node.js 22 + Fastify 5 + node-postgres

**Decisión.** La API se escribe en JavaScript (el mismo lenguaje del prototipo) con Fastify, que valida peticiones con JSON Schema de forma nativa y tiene plugins oficiales para JWT, CORS, cabeceras de seguridad, límite de intentos y Swagger. El acceso a la base es SQL directo con `pg` y consultas parametrizadas.

**Alternativas descartadas.** Express: habría que agregar validación, documentación y manejo de errores por separado. Un ORM (Prisma, Sequelize): su soporte de PostGIS es limitado y las consultas espaciales (`ST_DWithin`, `ST_AsGeoJSON`) igual quedarían en SQL crudo.

## D-15 · El contrato valida la API (contrato primero, de verdad)

**Decisión.** Al arrancar, la API lee `api/openapi.yaml` y con él:
- arma la validación de parámetros y cuerpo de cada ruta (los mismos límites del contrato);
- decide qué rutas exigen sesión (`security`) y qué roles las pueden usar (extensión `x-roles`);
- sirve la documentación interactiva en `/docs`;
- se niega a arrancar si el contrato declara una operación que nadie implementó.

Las pruebas validan cada respuesta contra el contrato: si la API devuelve un campo que el contrato no promete o un código de estado no documentado, la prueba falla.

**Consecuencia.** Contrato e implementación no pueden separarse sin que algo falle.

## D-16 · Autenticación, autorización y protección de cuentas

**Decisión.**
- Contraseñas cifradas con **bcrypt, costo 12**. Nunca se guardan ni se devuelven.
- Sesión con **JWT HS256 de 8 horas**. El secreto sale de `JWT_SECRET` (mínimo 32 caracteres); sin él la API no arranca.
- Dos roles: `administrador` (catálogo de destinos, precios y rutas; todos los productores) y `productor` (sus propios lotes y simulaciones).
- **Autorización por objeto:** un productor que pide el lote o la simulación de otro recibe **403**. Se eligió 403 en lugar de 404 para que el mensaje sea claro en la demostración; se puede cambiar a 404 si se quiere no revelar que el recurso existe.
- El inicio de sesión responde igual (mismo mensaje y tiempo similar) si el correo no existe o si la contraseña es incorrecta, y tiene un **límite de 10 intentos por minuto** por IP (429).
- Cabeceras de seguridad con Helmet y CORS restringido a `CORS_ORIGEN`. El log oculta el token y la contraseña.

## D-17 · Validación: 400 frente a 422

**Decisión.** Un parámetro de ruta o consulta mal formado (un UUID roto) es **400**; un cuerpo JSON bien formado que incumple una regla (300 animales, categoría inexistente) es **422**, con un detalle en español por cada campo. Todas las validaciones se reportan a la vez, no una por una. Las restricciones `CHECK` de la base son la última barrera, por si algo se escapa.

## D-18 · Ajustes de la entrevista implementados (cierra D-13)

**Decisión.** En la v0.3.0 entran todos los ajustes de D-13:
- destino `Venta en finca` (tipo `finca`, 0 km, sin merma ni comisión);
- merma de 6,5 % a 9,5 % en viajes largos;
- `capacidad_camion` y número de camiones: el flete y los peajes se multiplican por camión;
- `flete_incluye_peajes` para no cobrar dos veces;
- `comision_pct` por destino (3 % en subastas);
- precios de novillo de levante (solo en subastas, ferias y finca: los frigoríficos no compran levante).

**Resultado.** Con estos ajustes, en 7 de las 10 simulaciones de demostración la mejor opción es vender en la finca, que es lo que hace el ganadero entrevistado. Para lotes grandes de novillos gordos, el Frigorífico Guadalupe sigue ganando.

**Fuente de los precios.** Los precios siguen siendo estimaciones, ahora calibradas con el boletín *Comercio de ganado vacuno en subastas* del Observatorio de Precios y Costos Agrarios de la Universidad de Córdoba (OPCA, n.º 198, junio de 2026): macho cebado alrededor de 9.550 COP/kg en subastas del Caribe y 11.123 COP/kg en la feria de Medellín (enero de 2026); hembra gorda cerca del 85 % del macho. Cada precio guarda su fuente en `precio_mercado.fuente`.

## D-19 · Volumen alto para el hito H6: mapa de conveniencia por origen (planeado)

**Contexto.** El hito H6 de la Ruta H (semana 13) exige representar más de diez mil registros sin degradar la interacción. Con 11 destinos el proyecto no llega a ese volumen.

**Decisión.** En las entregas 4 y 5 se agrega un mapa de Casanare dividido en celdas de 1 km (unas 44.000) que muestra, para cada celda, qué destino le deja más utilidad a un lote que sale de ahí. Responde la pregunta real del ganadero entrevistado («desde mi finca, ¿a dónde me conviene?»). Se calcula en el servidor con PostGIS y se entrega como teselas vectoriales a MapLibre.

**Pendiente de decidir.** Cómo obtener la distancia por carretera de 44.000 orígenes: OSRM propio en Docker con el mapa de Colombia, o distancia en línea recta por un factor de sinuosidad calibrado con las rutas reales.

---

## D-20 · Precios: Fedegán como fuente, vigencia visible y carga por lotes

**Contexto.** No existe una fuente pública con precios de ganado en pie en tiempo real ni con API. La más completa para el proyecto es Fedegán, que publica precios semanales por región, planta y subasta.

**Decisión.**
- **Fuente:** los reportes semanales de Fedegán. Una persona del equipo los pasa a una hoja de Google publicada como CSV ([`docs/precios/README.md`](precios/README.md)); la tarea programada `precios.yml` la importa cada 3 días.
- **Carga por lotes:** `POST /precios/importacion` (solo administrador) recibe el CSV. Es todo o nada: si una fila tiene errores, no se guarda ninguna y la respuesta dice fila y campo. Si el precio de ese destino, categoría y fecha ya existe, se actualiza. Cada carga queda registrada en `importacion_precio`.
- **Vigencia visible:** cada resultado de simulación guarda la fecha y la antigüedad del precio usado. Con más de 7 días lleva advertencia; con más de 30, ese destino no se compara. La tarea programada falla (y GitHub avisa por correo) si algún precio pasa de 7 días.
- **Datos de demostración siempre frescos:** el script de semilla corre todas las fechas para que el precio más reciente sea de hace 2 días.

**Alternativa descartada por ahora.** Extraer automáticamente el texto de las páginas de Fedegán: se rompe si cambian el diseño y primero hay que confirmar que sus condiciones de uso lo permiten. Se reevalúa si el portal de estadísticas ofrece descarga en Excel o CSV.

---

## D-21 · El tablero usa la API real; el cálculo se hace solo en el servidor

**Contexto.** En la Entrega 2 el tablero leía `web/datos/ejemplo.json` y calculaba la utilidad en el navegador. El docente pidió que la Entrega 3 sea funcional «en real».

**Decisión.**
- Todas las pantallas llaman a la API (`web/js/api.js`): ingreso y registro (`/auth`), lotes, simulaciones, destinos, rutas y precios. El navegador **ya no calcula**: envía lote, flete, capacidad del camión y destinos a `POST /simulaciones` y muestra lo que el servidor calcula y guarda. Así el resultado no se puede alterar desde el navegador y el historial es el mismo en cualquier dispositivo.
- La sesión (token JWT de 8 horas) se guarda en `localStorage`. Cuando la API responde 401 se borra y se lleva al usuario a **Ingresar**, que lo devuelve a la pantalla donde estaba.
- Los errores 422 de la API (`detalles[].campo`) se muestran junto al campo correspondiente; `destino_ids[i]` se traduce al nombre del destino.
- Si el lote se guarda pero la simulación falla, el formulario queda apuntando a ese lote para no duplicarlo al reintentar.
- Nueva pantalla **Precios**: muestra fecha, fuente y vigencia de cada precio; el administrador descarga la hoja actual en CSV, la actualiza con el reporte de Fedegán y la sube (`POST /precios/importacion`). Los precios cuya fuente no es Fedegán se marcan «Estimado» para que nadie los tome como reales.
- **Modo demostración:** si el tablero no sabe dónde está la API (GitHub Pages), lee `ejemplo.json` en modo de solo lectura y lo avisa en cada pantalla. Guardar responde «solo lectura».

**Riesgo cubierto.** Las pruebas automáticas borran la base. Desde ahora exigen `DATABASE_URL_PRUEBAS` distinta de `DATABASE_URL`, para no borrar los precios reales cargados por el equipo.

## D-22 · GitHub Codespaces como entorno de ejecución del equipo

**Contexto.** Ningún computador del equipo soporta Docker Desktop, pero la guía exige `docker compose` y la demostración en clase necesita la API corriendo.

**Decisión.** `.devcontainer/` configura un Codespace con Docker incluido. Al crearse, `preparar.sh` genera el `.env` con claves aleatorias (nunca se versiona) y admite el origen `https://*.app.github.dev` en CORS. El tablero deduce la dirección de la API cambiando `-8080` por `-3000`. El puerto 3000 debe ponerse en *Public* porque el navegador llama a la API desde otro origen; la API sigue protegida por JWT.

**Alternativa.** PostgreSQL gestionado (Neon, con PostGIS) y Node.js instalado en el equipo, sin Docker. Queda como respaldo si se agotan las horas gratuitas de Codespaces.

## D-23 · Las rutas salen del municipio del lote

**Contexto.** El formulario pedía el municipio de origen, pero el cálculo usaba siempre las rutas desde Yopal: un lote de Paz de Ariporo veía la subasta de su propio municipio a 128 km.

**Decisión.** `POST /simulaciones` busca la ruta desde el `municipio_origen` del lote (`src/geo/origenes.js`). Si es un municipio de Casanare y todavía no hay ruta hacia ese destino, la crea y la guarda (se calcula una sola vez por municipio y destino):
- **Con OSRM** (`OSRM_BASE_URL`, 5 s de espera máxima): distancia, tiempo y trazado por carretera. `fuente = osrm`.
- **Si OSRM no responde:** línea recta × la sinuosidad de la ruta Yopal → destino (entre 1,15 y 1,6), nunca más larga que ir por Yopal. Para destinos al otro lado de la cordillera (recargo ≥ 1,15) se va por Yopal si el municipio queda detrás, porque la cordillera solo se cruza por ciertos pasos. `fuente = respaldo_linea_recta`. Error esperado: ±25 %.
- La merma y los peajes se interpolan por distancia con las rutas medidas desde Yopal; el recargo de la vía es el de la ruta Yopal → destino; la venta en finca es 0 km desde cualquier origen.
- El tablero dice si las distancias son medidas o estimadas, y dibuja el origen correcto en el mapa. `GET /rutas` acepta `?origen=`.
- Si el municipio no es de Casanare se usan las rutas de Yopal, como antes.

**Pendiente.** Validar las distancias estimadas con transportadores, y medir con OSRM las 19 × 11 rutas en la publicación para no depender de estimaciones.

## D-24 · Publicación permanente: GitHub Pages + Render + Neon

**Contexto.** El docente pidió un producto que funcione de verdad. Con Codespaces la aplicación solo existe mientras alguien del equipo la tiene abierta.

**Decisión.**
- **Tablero:** sigue en GitHub Pages (HTTPS). `web/js/config.js` guarda la dirección de la API publicada; vacía = modo demostración.
- **API:** Render, plan gratuito, con el mismo `api/Dockerfile` (`render.yaml`). Al arrancar migra y siembra si la base está vacía. `JWT_SECRET` lo genera Render; `DATABASE_URL` y `CONTRASENA_DEMO` se escriben en su panel, nunca en el repositorio.
- **Base:** Neon, PostgreSQL 16 gratuito con PostGIS, conexión con `sslmode=require`.
- `TRUST_PROXY=1` en Render, para que el límite de intentos de ingreso cuente por usuario y no por el proxy.
- El plan gratuito de Render apaga la API tras 15 minutos sin uso; el tablero avisa «El servidor se está despertando» si una consulta tarda más de 4 segundos.

**Alternativas.** Railway o Fly.io (ya no tienen plan gratuito permanente); un VPS propio (costo mensual y mantenimiento). Se reevalúa en la Entrega 4 si el tiempo de arranque molesta en las pruebas con ganaderos.

## D-25 · Tipos de cuenta, fincas, administración desde el tablero e integridad

**Contexto.** El docente pidió demostrar el CRUD, la validación y los roles desde la propia página, no desde Swagger, y que las cuentas se comporten como en un producto real.

**Decisión.**
- **Persona o empresa.** El registro pide tipo de persona; una persona se identifica con CC o CE, una empresa con NIT (se comprueba el dígito de verificación de la DIAN) y representante legal. El documento es obligatorio y único. El municipio es la lista cerrada de los 19 de Casanare, con vereda opcional. El registro exige autorizar el tratamiento de datos (Ley 1581 de 2012) y guarda cuándo.
- **Fincas.** Recurso propio: cada productor registra sus fincas con municipio, vereda, área y punto en el mapa (a menos de 120 km de la cabecera). El lote elige su finca y de ella toma el municipio de origen; si la finca cambia de municipio, sus lotes no vendidos la siguen.
- **Mi cuenta.** Cada usuario edita sus datos (nombre y correo iguales en cuenta y ficha), cambia su contraseña dando la actual y puede eliminar su cuenta: sin lotes se borra todo; con lotes la ficha queda anónima y la historia se conserva.
- **Administración** (solo administradores): resumen, cuentas (crear con contraseña inicial, cambiar rol, suspender, reactivar, contraseña temporal, eliminar), productores (editar, verificar documento), destinos y rutas (crear, corregir, desactivar), precios (carga CSV y corrección de uno), lotes de todos y bitácora.
- **Reglas de integridad**: lo que tiene datos no se borra sino que se desactiva (cuentas suspendidas, fincas y destinos inactivos, lotes vendidos); nunca queda el sistema sin un administrador activo y nadie se quita el rol ni se suspende a sí mismo; cada petición con token vuelve a leer la cuenta, así que una suspensión o un cambio de rol aplican de inmediato; una cuenta con contraseña temporal solo puede cambiarla; un documento verificado solo lo cambia el administrador.
- Toda acción de administración queda en la tabla `bitacora`.

**Alternativas.** Administrar desde la consola de Neon o desde Swagger (no demuestra el producto ni sus reglas); borrar en cascada (pierde la historia de simulaciones); revocar tokens con una lista negra (más complejo que leer la cuenta en cada petición, que cuesta una consulta por índice).
