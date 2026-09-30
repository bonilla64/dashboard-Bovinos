# Wireframes (actualizados en la Entrega 2)

Los wireframes de la Entrega 1 eran bocetos en texto. Aquí están actualizados según lo que se construyó en el prototipo, con los cambios y su porqué. Las imágenes `.png` son capturas del prototipo navegable publicado (escritorio a 1280 px y móvil a 360 px).

## 1. Tablero comparativo (`web/index.html`)

```
+--------------------------------------------------------------------+
| [logo] Destinos ganaderos        Tablero | Registrar lote | Historial|
+--------------------------------------------------------------------+
| Lote activo: 30 novillos gordos, 13.560 kg. Flete $6.500/km [Cambiar]|
| LLÉVELO A FRIGORÍFICO GUADALUPE, EN BOGOTÁ                          |
| Le quedan $143,1 millones... $2,4 millones más que en Tunja...      |
+--------------------------------------------------------------------+
| Tipo de destino [x]Subastas [x]Ferias [x]Frigoríficos [x]Plantas    |
| Distancia máxima [=========o] Hasta 800 km        [Quitar filtros]  |
+-------------------------------------+------------------------------+
| MAPA: rutas desde Yopal             | GRÁFICO: gana o pierde       |
| (mejor destino en dorado,           | frente a vender cerca        |
|  seleccionado en verde)             | Guadalupe   +$2,9 M ████     |
|                                     | Tunja       +$0,5 M █        |
|                                     | Medellín    −$1,4 M   ██     |
+-------------------------------------+------------------------------+
| TABLA: Destino | Km | Tiempo | Merma | $/kg | Flete | Peajes | Utilidad | [Ver en mapa] |
+--------------------------------------------------------------------+
```

Capturas: `01-tablero.png`, `01-tablero-movil.png`.

Cambios frente a la Entrega 1:
- **La respuesta va primero, en una frase.** El productor no quiere leer una tabla para saber a dónde ir; la tabla queda como respaldo.
- **El gráfico muestra diferencias frente a vender cerca**, no la utilidad total. Las utilidades totales de todos los destinos se parecen (entre 135 y 143 millones) y en barras absolutas se verían iguales; la diferencia es lo que decide.
- **Se agregaron filtros** por tipo de destino y distancia máxima, que actualizan a la vez mapa, gráfico y tabla (visualizaciones vinculadas, Ruta H).
- **Se agregó la columna de merma** (ver `decisiones.md`, D-06).

## 2. Registro del lote (`web/detalle.html`)

```
+----------------------------------------------------+
| Registrar lote y comparar destinos                 |
| [Resumen de errores con enlaces, si los hay]       |
| PRODUCTOR   Productor responsable [ v ]            |
| DATOS DEL LOTE                                     |
|   Nombre del lote [__________]                     |
|   Categoría [ v ]           Raza (opcional) [____] |
|   Cantidad [____]           Peso promedio kg [___] |
|   Finca (opcional) [____]   Municipio [ v ]        |
|   Peso total del lote: 13.560 kg (se calcula solo) |
| TRANSPORTE Y DESTINOS                              |
|   Flete por km (COP) [6500]                        |
|   Destinos a comparar [x] ... (mínimo dos)         |
| [Calcular y ver en el tablero]  [Cancelar]         |
+----------------------------------------------------+
```

Capturas: `02-formulario.png`, `02-formulario-movil.png`, `05-formulario-errores.png`.

Cambios frente a la Entrega 1: se agregaron productor, categoría (define el precio), finca y municipio de origen, para que el formulario tenga todos los campos del modelo `LoteEntrada`. Cada campo tiene etiqueta visible, ayuda y mensaje de error en texto.

## 3. Historial de simulaciones (`web/historial.html`)

```
+----------------------------------------------------+
| Historial de simulaciones                          |
| Buscar [__________]  Mejor destino [ v ]  [Nueva]  |
| 9 simulaciones, de la más reciente a la más antigua|
| 27 sep 2026 | Vacas de descarte del hato | Mejor: Guadalupe $77,1 M | Ver detalle |
|   > tabla por destino + [Abrir en el tablero] [Editar el lote]      |
| ...                                                |
+----------------------------------------------------+
```

Capturas: `03-historial.png`, `03-historial-movil.png`.

## 4. Estados excepcionales

| Estado | Dónde aparece | Cómo verlo | Captura |
|---|---|---|---|
| Cargando | Tablero, formulario e historial mientras llegan los datos | `index.html?demo=cargando` | `04-estado-cargando.png` |
| Vacío | Tablero cuando los filtros no dejan destinos; historial sin simulaciones o sin coincidencias | `index.html?demo=vacio`, `historial.html?demo=vacio` | `04-estado-vacio.png` |
| Error | Tablero, formulario e historial si no responde el servidor | `index.html?demo=error` | `04-estado-error.png` |
| Error de validación | Formulario | Enviar el formulario vacío | `05-formulario-errores.png` |
| Mapa sin fondo | Tablero sin internet para las teselas | Desconectar la red | — |
