# Cómo se mantienen actualizados los precios

**Fuente: Fedegán.** No hay una fuente pública que entregue precios de ganado en pie en tiempo real o con una API. Fedegán publica precios **semanales** de ganado gordo por región, planta y subasta: en su portal de estadísticas (https://estadisticas.fedegan.org.co, sección de precios) y en la serie «Precio del ganado, semana del … al …» de su medio Contexto Ganadero (https://www.contextoganadero.com). Por eso el sistema funciona así:

```
Reporte semanal de Fedegán ──► Hoja de Google del equipo ──► (cada 3 días) tarea programada ──► Base de datos
         (una persona lo copia)        (publicada como CSV)        .github/workflows/precios.yml
```

Y la aplicación siempre dice qué tan fresco es cada precio:

| Antigüedad del precio | Qué pasa en la simulación |
|---|---|
| 7 días o menos | Se usa normalmente |
| De 8 a 30 días | Se usa, con la advertencia «Precio de hace N días» |
| Más de 30 días | No se compara ese destino; la API pide actualizar los precios |

Los límites se cambian con `PRECIO_DIAS_ADVERTENCIA` y `PRECIO_DIAS_MAXIMO` en `.env`.

## 1. Preparar la hoja (una sola vez)

1. En Google Drive, **Nuevo → Hojas de cálculo de Google → Importar** y suba [`plantilla-fedegan.csv`](plantilla-fedegan.csv). Trae una fila por destino y categoría, con los precios actuales y la columna `referencia`, que indica qué plaza del reporte de Fedegán corresponde a cada destino.
2. **Archivo → Compartir → Publicar en la web**. Elija la hoja, el formato **Valores separados por comas (.csv)** y **Publicar**. Copie el enlace.
3. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - `PRECIOS_CSV_URL` = el enlace del paso 2.
   - `DATABASE_URL` = la conexión de la base publicada (se crea en la Entrega 4).

Desde ese momento, la tarea **Precios · sincronizar desde Fedegán** lee la hoja más o menos cada 3 días. También se puede correr a mano en **Actions → Precios · sincronizar desde Fedegán → Run workflow**.

## 2. Actualizar la hoja (cada semana, unos 10 minutos)

Responsable sugerido: rota entre el equipo; queda como tarea recurrente en el tablero.

1. Abra el reporte de precios más reciente de Fedegán.
2. Para cada fila de la hoja, busque la plaza indicada en `referencia` y copie el precio por kilo en pie de la categoría.
3. Cambie `fecha` por la fecha del reporte (AAAA-MM-DD o DD/MM/AAAA) y deje en `fuente` el nombre del reporte, por ejemplo «Fedegán – precio del ganado, semana del 4 al 10 de octubre».
4. **Agregue filas nuevas** en lugar de sobrescribir las anteriores si quiere conservar el historial en la hoja; la base guarda el historial de todas formas.

Reglas que revisa la importación (si una fila falla, no se carga ninguna y el error dice fila y campo):

| Columna | Regla |
|---|---|
| `destino` | Nombre exacto del destino en la aplicación (con tildes) o su id. Filas con esta columna vacía se ignoran |
| `categoria` | `novillo_gordo`, `vaca_gorda`, `novillo_levante`, `ternero_destete` o `toro` |
| `precio_kg_cop` | Entre 3.000 y 30.000. Se aceptan `10400`, `10.400` y `$10,400` |
| `fecha` | No puede ser futura |
| `fuente` | Obligatoria |
| `referencia` | Opcional: plaza o enlace del reporte |

Los frigoríficos y plantas de beneficio no compran ganado de levante: no les ponga precio de levante.

**Venta en finca:** Fedegán no publica ese precio. Sale de lo que reporten los productores (por ejemplo, la entrevista del 29 de septiembre: macho de levante a 12.000 COP/kg).

## 3. Cargar sin esperar la tarea programada

El administrador puede cargar la hoja en cualquier momento:

- **Desde el tablero (la forma más fácil):** ingrese como administrador → **Precios** → **Descargar la hoja con los precios actuales**, cambie precios, fecha y fuente con el reporte de Fedegán, guárdela como CSV y súbala en **Cargar precios de Fedegán**. La pantalla dice qué fila corregir si algo está mal y muestra el historial de cargas.
- **Desde Swagger** (`/docs`): inicie sesión como administrador, **Authorize**, y en **Precios → POST /precios/importacion** pegue el contenido del CSV.
- **Desde la terminal:**
  ```bash
  curl -X POST http://localhost:3000/api/v1/precios/importacion \
    -H "Authorization: Bearer SU_TOKEN" -H "Content-Type: text/csv" \
    --data-binary @plantilla-fedegan.csv
  ```
- **Con el script** (lee `PRECIOS_CSV_URL`): `cd api && npm run precios:sincronizar -- --revisar`

`GET /precios/importaciones` muestra las últimas 20 cargas: cuándo, quién, cuántos precios nuevos y cuántos cambiaron.

## Pendiente

- Confirmar en el portal de estadísticas de Fedegán si permite descargar los precios en Excel o CSV. Si es así, la tarea programada puede leer ese archivo directamente, sin copiar a mano.
- Pedir a la Subasta de Yopal sus resultados por remate: sería la fuente más directa para Casanare.
