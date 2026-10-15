# Evidencias de la Entrega 2

Guarde aquí las capturas que exige la guía, con estos nombres:

| Archivo | Qué debe mostrar |
|---|---|
| `lighthouse-index.png` | Lighthouse, categoría Accesibilidad ≥ 90, sobre la URL publicada de `index.html` |
| `lighthouse-detalle.png` | Igual, sobre `detalle.html` |
| `lighthouse-historial.png` | Igual, sobre `historial.html` |
| `swagger-editor-valido.png` | `api/openapi.yaml` pegado en editor.swagger.io, sin errores |
| `prism-mock.png` | Terminal con Prism levantado y una petición `curl` respondiendo |
| `movil-360.png` | DevTools en 360 px de ancho, sin barra horizontal |
| `github-project.png` | Tablero del equipo con tareas asignadas |

## Entrega 3 · MVP del backend

Guárdelas en `docs/evidencias/entrega3/` con estos nombres. **Las 6 mínimas**, una por cada punto que pide el profesor, son: `02-swagger-docs.png` (documentación), `03-ingreso-token.png` (autenticación), `06-error-403.png` (autorización), `07-error-422.png` (validación), `20-producto-publicado-celular.png` (demostración funcional) y `11-pruebas-ci.png` (pruebas). Las demás son complementarias.

| Archivo | Qué debe mostrar |
|---|---|
| `01-docker-compose-up.png` | Terminal del Codespace con `docker compose up --build` y la línea `Server listening at http://0.0.0.0:3000` |
| `02-swagger-docs.png` | http://localhost:3000/docs con la lista de operaciones y el candado de **Authorize** |
| `03-ingreso-token.png` | `POST /auth/ingreso` ejecutado en Swagger, con el token en la respuesta 200 |
| `04-simulacion-201.png` | `POST /simulaciones` con sesión iniciada, respuesta 201 con los resultados ordenados |
| `05-error-401.png` | Una operación con candado ejecutada sin token: respuesta 401 `NO_AUTENTICADO` |
| `06-error-403.png` | Hernando pidiendo el lote de Luz Marina (`7461b160-f980-5d27-af1b-7bd4bb9b14f1`): respuesta 403 |
| `07-error-422.png` | `POST /lotes` con `{}`: respuesta 422 con un detalle por campo |
| `08-filtro-espacial.png` | `GET /destinos?cerca_lat=5.3371&cerca_lon=-72.3959&radio_km=150` con `distancia_lineal_km` |
| `09-base-de-datos.png` | Las tablas en la base, por ejemplo con `docker compose exec db psql -U ganadero -d simulador_ganadero -c "\dt"` |
| `10-contrasena-cifrada.png` | `SELECT correo, contrasena_hash FROM usuario LIMIT 3;` mostrando los hashes `$2b$12$…` |
| `11-pruebas-ci.png` | Pestaña Actions de GitHub con **API · pruebas e imagen** en verde y `# pass 73` |
| `12-ingreso.png` | Pantalla **Ingresar** del tablero, y el error «Correo o contraseña incorrectos» con una contraseña mala |
| `13-tablero-api.png` | Tablero después de calcular un lote nuevo: «Calculado por el servidor el …» y la tabla con la fecha de cada precio |
| `14-error-servidor-formulario.png` | Formulario con un lote de levante y un frigorífico marcado: «El lote se guardó, pero no se pudo calcular» con el nombre del destino |
| `15-historial-api.png` | Historial con la simulación recién creada y el botón **Eliminar** |
| `16-precios-fedegan.png` | Pantalla **Precios** como administrador, después de cargar la hoja de Fedegán: «Precios cargados» y la tabla con fecha y fuente Fedegán |
| `17-carga-precios-error.png` | Carga de un CSV con un destino mal escrito: lista roja con fila y columna |
| `18-codespaces-puertos.png` | Pestaña **Ports** del Codespace con 3000 en *Public* y 8080 |
| `19-render-live.png` | Panel de Render con el servicio `simulador-ganadero-api` en **Live** (sin mostrar las variables secretas) |
| `20-producto-publicado-celular.png` | https://bonilla64.github.io/dashboard-Bovinos/ abierto en un celular, con sesión iniciada y un resultado calculado |
| `21-rutas-desde-municipio.png` | Tablero de un lote de Paz de Ariporo: «Rutas desde Paz de Ariporo», la subasta local a pocos km y los precios en arroba |
