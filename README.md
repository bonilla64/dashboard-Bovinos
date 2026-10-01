# Simulador de Destinos Ganaderos desde Yopal

Esta aplicación web le dice a un ganadero de Casanare a qué subasta, feria o frigorífico le conviene llevar su lote de ganado. Para cada destino tiene en cuenta el precio por kilo, el flete, los peajes y el peso que pierden los animales en el viaje.

**Úsela en línea, sin instalar nada:** https://bonilla64.github.io/dashboard-Bovinos/

Funciona en el celular, la tableta o el computador, en cualquier navegador actual (Chrome, Edge, Firefox o Safari).

> **Versión de prueba (Entrega 2).** Los precios, peajes y porcentajes de pérdida de peso son estimaciones del equipo, no cotizaciones reales. Úselos para conocer la herramienta, no para cerrar un negocio. Los lotes que registre se guardan solo en su navegador.

---

## Contenido

1. [Usarla en línea](#1-usarla-en-línea)
2. [Instalarla en su computador](#2-instalarla-en-su-computador)
3. [Cómo usarla paso a paso](#3-cómo-usarla-paso-a-paso)
4. [Cómo se calcula lo que le queda](#4-cómo-se-calcula-lo-que-le-queda)
5. [Si algo no funciona](#5-si-algo-no-funciona)
6. [Preguntas frecuentes](#6-preguntas-frecuentes)
7. [Para desarrolladores](#7-para-desarrolladores)
8. [Información del proyecto](#8-información-del-proyecto)

---

## 1. Usarla en línea

1. Abra https://bonilla64.github.io/dashboard-Bovinos/ en el navegador.
2. Si la va a usar seguido en el celular, puede agregarla a la pantalla de inicio:
   - En Android con Chrome: menú ⋮ → **Agregar a la pantalla principal**.
   - En iPhone con Safari: botón **Compartir** → **Agregar a inicio**.

No necesita crear cuenta ni contraseña.

## 2. Instalarla en su computador

Hágalo solo si quiere usarla sin depender de la página publicada, o si va a modificarla. Tarda unos cinco minutos.

### Lo que necesita

| Programa | Versión | Para qué | Dónde se descarga |
|---|---|---|---|
| Git | 2.40 o superior | Descargar el proyecto | https://git-scm.com/downloads |
| Python | 3.10 o superior | Abrir la aplicación en su computador | https://www.python.org/downloads/ |

En lugar de Python puede usar Node.js 20 o superior (https://nodejs.org). Basta con uno de los dos.

En Windows, al instalar Python marque la casilla **«Add Python to PATH»**.

Para comprobar que quedaron instalados, abra una terminal (en Windows: **Git Bash** o **Símbolo del sistema**) y escriba:

```bash
git --version
python --version
```

Cada comando debe mostrar un número de versión. En algunos equipos el segundo comando es `python3 --version`.

### Pasos

1. **Descargue el proyecto.** En la terminal:
   ```bash
   git clone https://github.com/bonilla64/dashboard-Bovinos.git
   cd dashboard-Bovinos
   ```
   Si no quiere usar Git: en la página del repositorio, botón verde **Code → Download ZIP**, descomprima el archivo y abra la terminal dentro de la carpeta.

2. **Encienda la aplicación.** Dentro de la carpeta del proyecto:
   ```bash
   python -m http.server 8080 --directory web
   ```
   Si usa Node.js en lugar de Python:
   ```bash
   npx --yes serve web -l 8080
   ```
   La terminal queda ocupada mientras la aplicación está encendida. No la cierre.

3. **Ábrala en el navegador:** http://localhost:8080

4. **Para apagarla**, vuelva a la terminal y presione `Ctrl + C`.

> **Importante:** no abra el archivo `index.html` con doble clic. El navegador no deja leer los datos así y verá el mensaje «No se pudieron cargar los destinos». Siempre use el paso 2.

## 3. Cómo usarla paso a paso

La aplicación tiene tres pantallas, a las que se llega desde el menú de arriba: **Tablero**, **Registrar lote** e **Historial**.

### 3.1 Registrar su lote

Entre a **Registrar lote** y llene el formulario:

| Campo | Qué escribir | Ejemplo |
|---|---|---|
| Productor responsable | Quién vende el lote | Hernando Rincón Barrera (Yopal) |
| Nombre del lote | Un nombre para reconocerlo después | Novillos cebados de octubre |
| Categoría | El tipo de animal. Define qué precio se aplica | Novillo gordo |
| Raza o cruce (opcional) | La raza, si la quiere anotar | Brahman comercial |
| Cantidad de animales | Entre 1 y 200 | 30 |
| Peso promedio por animal | En kilos, entre 80 y 900. Si pesó todo el lote en báscula, divida el peso total entre el número de animales | 452 |
| Finca o hato (opcional) | Dónde están los animales | Finca La Esperanza |
| Municipio de origen | De dónde sale el camión | Yopal |
| Valor del flete por kilómetro | Lo que cobra el transportador por kilómetro, por el camión completo | 6500 |
| Destinos a comparar | Marque al menos dos. Vienen todos marcados | |

Mientras escribe la cantidad y el peso, el formulario le muestra el **peso total del lote**.

Oprima **Calcular y ver en el tablero**. Si falta un dato o hay un valor fuera de rango, arriba aparece una lista con los problemas; toque cada uno para ir directo al campo.

En esta versión solo hay precios para **novillo gordo** y **vaca gorda**. Si elige otra categoría, el formulario se lo avisa.

### 3.2 Leer el tablero

El tablero responde la pregunta en una frase, por ejemplo:

> **Llévelo a Frigorífico Guadalupe, en Bogotá.** Le quedan $143,1 millones después de pagar $3,2 millones de flete y peajes. Son $2,4 millones más que en Plaza de ferias de Tunja.

Debajo hay tres vistas que muestran lo mismo de forma distinta:

- **Mapa.** Las rutas desde Yopal. La ruta dorada es el mejor destino y la verde es la que usted seleccionó.
- **Gráfico «Cuánto gana o pierde frente a vender cerca».** Compara cada destino con vender en el lugar más cercano. Las barras hacia la derecha significan que gana más que vendiendo cerca; las rojas hacia la izquierda, que pierde.
- **Tabla de comparación.** El detalle de cada destino, ordenado de mayor a menor utilidad:

| Columna | Qué significa |
|---|---|
| Distancia y Tiempo | Kilómetros y horas de viaje por carretera desde Yopal |
| Merma | Porcentaje de peso que pierden los animales en el viaje |
| Precio por kg | Lo que paga ese destino por kilo en pie |
| Flete | Lo que cuesta el camión hasta ese destino |
| Peajes | Peajes estimados de la ruta |
| Utilidad neta | Lo que le queda: lo que le pagan menos flete y peajes |

Toque un destino en el gráfico, en la tabla (**Ver en mapa**) o en el mapa: se resalta en las tres vistas a la vez.

Para ver menos destinos, use los **filtros**: marque o desmarque los tipos (subastas, ferias, frigoríficos, plantas de beneficio) o mueva **Distancia máxima**. **Quitar filtros** vuelve a mostrar todos.

Para cambiar el lote o el flete, use el enlace **Cambiar lote o flete**, arriba en el tablero.

### 3.3 Revisar el historial

En **Historial** están las comparaciones guardadas, de la más reciente a la más antigua.

- Busque por nombre del lote, finca o productor, o filtre por mejor destino.
- Toque **Ver detalle** para ver el resultado de cada destino.
- **Abrir en el tablero** muestra esa comparación con los precios del día en que se hizo. Desde ahí puede **recalcular con los precios actuales**.
- **Editar el lote** abre el formulario con los datos de ese lote.

### 3.4 Usarla solo con el teclado o con lector de pantalla

- La tecla **Tab** recorre todos los botones, filtros y campos, y **Enter** los activa. El elemento activo siempre se ve con un borde azul.
- La primera parada de Tab es **Saltar al contenido**, que lleva directo a la información.
- El mapa no es necesario para usar la aplicación: la tabla y el gráfico tienen la misma información y los lectores de pantalla los leen.

## 4. Cómo se calcula lo que le queda

Para cada destino:

```
Peso que llega      = peso total del lote × (1 − merma %)
Flete               = distancia × flete por km × recargo de la vía
Costo de transporte = flete + peajes
Lo que le pagan     = peso que llega × precio por kilo del destino
Utilidad neta       = lo que le pagan − costo de transporte
```

El **recargo de la vía** sube el flete en carreteras de montaña: por ejemplo, 25 % más hacia Bogotá y 40 % más hacia Medellín.

**Ejemplo con 30 novillos de 452 kg (13.560 kg) y flete de $6.500 por km:**

| | Subasta de Yopal | Frigorífico Guadalupe (Bogotá) |
|---|---|---|
| Distancia | 9,5 km | 382 km |
| Merma | 0,5 % → llegan 13.492 kg | 4,5 % → llegan 12.950 kg |
| Precio por kilo | $10.400 | $11.300 |
| Lo que le pagan | $140,3 millones | $146,3 millones |
| Flete y peajes | $0,06 millones | $3,2 millones |
| **Le queda** | **$140,3 millones** | **$143,1 millones** |

Bogotá paga $900 más por kilo, pero los animales pierden 610 kg en el viaje y cuesta $3,2 millones de transporte. Aun así deja $2,9 millones más que vender en Yopal.

## 5. Si algo no funciona

| Lo que ve | Qué pasó | Qué hacer |
|---|---|---|
| «No se pudieron cargar los destinos» | No hubo conexión, o abrió el archivo con doble clic | Revise el internet y toque **Volver a intentar**. Si la instaló en su computador, ábrala como dice la sección 2, paso 2 |
| «Ningún destino cumple los filtros» | Los filtros dejaron la lista vacía | Toque **Mostrar todos los destinos** o amplíe la distancia máxima |
| El mapa se ve sin calles ni ciudades | El fondo del mapa necesita internet y no cargó | Las rutas, el gráfico y la tabla siguen funcionando. Recargue cuando tenga señal |
| «Todavía no hay precios de…» | Eligió una categoría sin precios en esta versión | Use novillo gordo o vaca gorda |
| Mensajes en rojo en el formulario | Falta un dato o está fuera de rango | Lea el mensaje de cada campo; la lista de arriba lleva a cada uno |
| En la terminal: `Address already in use` | El puerto 8080 ya está ocupado | Cambie `8080` por `8081` en el comando y abra http://localhost:8081 |
| En la terminal: `python no se reconoce como un comando` | Python no está instalado o no está en el PATH | Pruebe `python3` o `py`; si no funciona, reinstale Python marcando «Add Python to PATH» |

## 6. Preguntas frecuentes

**¿Los precios son reales?**
No en esta versión. Son estimaciones del equipo para probar la herramienta. En las próximas versiones cada precio mostrará de dónde salió y de qué fecha es.

**¿Dónde quedan guardados mis lotes?**
En esta versión, solo en el navegador del equipo donde los registró. Si borra los datos del navegador o usa otro celular, no los verá. En la versión con servidor quedarán guardados en línea.

**¿Por qué a veces conviene vender cerca aunque paguen menos por kilo?**
Porque en viajes largos el ganado pierde peso y el flete sube. La aplicación lo tiene en cuenta; por eso el destino con mejor precio por kilo no siempre es el que más deja.

**¿Qué hago si mi transportador cobra distinto?**
Escriba su valor real en **Valor del flete por kilómetro** y vuelva a calcular.

---

## 7. Para desarrolladores

### Estructura del proyecto

```
├── README.md               Esta guía
├── .gitignore
├── .env.example            Variables para las entregas 3 y 4, sin valores reales
├── .github/workflows/      Publicación en GitHub Pages y validación del contrato
├── api/openapi.yaml        Contrato de la API (OpenAPI 3.1)
├── docs/
│   ├── modelo-datos.md     Entidades, atributos, relaciones, índices y motor
│   ├── modelo-datos.png    Diagrama del modelo
│   ├── decisiones.md       Decisiones de arquitectura y su porqué
│   ├── wireframes/         Wireframes actualizados y capturas del prototipo
│   └── evidencias/         Capturas de Lighthouse, Swagger Editor y Prism
└── web/
    ├── index.html          Tablero: mapa, gráfico y tabla vinculados
    ├── detalle.html        Formulario de registro del lote
    ├── historial.html      Historial de simulaciones
    ├── css/estilos.css
    ├── js/app.js
    ├── datos/ejemplo.json  Datos de ejemplo (misma forma que las respuestas de la API)
    └── vendor/leaflet/     Leaflet 1.9.4 (licencia BSD-2), incluido para no depender de un CDN
```

### Servidor simulado de la API

Requiere Node.js 20 o superior.

```bash
npx --yes @stoplight/prism-cli mock api/openapi.yaml -p 4010
```

En otra terminal:

```bash
curl http://127.0.0.1:4010/destinos
curl -X POST http://127.0.0.1:4010/lotes -H "Content-Type: application/json" -d "{}"   # responde 422
```

### Validar el contrato

```bash
npx --yes @redocly/cli@1 lint api/openapi.yaml
```

También se puede pegar el archivo en https://editor.swagger.io. Se valida automáticamente en cada pull request.

### Ver los estados de la interfaz

| Estado | URL |
|---|---|
| Cargando | `index.html?demo=cargando` |
| Sin resultados | `index.html?demo=vacio` o `historial.html?demo=vacio` |
| Error de conexión | `index.html?demo=error` o `historial.html?demo=error` |

---

## 8. Información del proyecto

### El problema

Casanare tiene 2.431.203 bovinos y bufalinos (Fedegán, ciclo II de vacunación de 2025). El productor que vende un lote decide el destino con precios que consigue por teléfono y un cálculo de flete hecho a mano, sin ver juntos el precio, el transporte y la pérdida de peso.

### Ruta y equipo

- **Ruta de profundización:** H · Visualización de datos y web geoespacial
- **Curso:** Tecnologías Web 2026-B, Ingeniería de Sistemas, Unitrópico (Yopal)
- **Equipo N.º:** 1 · **Grupo:** 2

| Integrante | Rol | Usuario de GitHub |
|---|---|---|
| David Fabián Pérez Bonilla | Líder técnico | @bonilla64 |
| Daniela Angélica Cruz González | DevOps y calidad | @danielacruz-sudo |
| Juan Mario Angarita Cruz | Frontend y experiencia | @dgg6h7zw76-glitch |
| Juan David Piracón Guauque | Backend y datos | @COMPLETAR |

Los roles rotan al menos una vez en el semestre; el cambio se registra en esta tabla.

### Estado del proyecto

| Entrega | Fecha | Estado | Qué hay |
|---|---|---|---|
| 1 · Anteproyecto | 17 sep 2026 | Entregada | Problema, ruta H, wireframes en texto, plan de trabajo |
| 2 · Prototipo y contrato | 1 oct 2026 | **En curso** (`v0.2.0`) | Prototipo navegable de 3 pantallas con estados, contrato OpenAPI 3.1 con 6 recursos, modelo de datos |
| 3 · API y persistencia | 15 oct 2026 | Pendiente | API REST sobre PostgreSQL + PostGIS según el contrato |
| 4 · Mapa desplegado con HTTPS | 12 nov 2026 | Pendiente | |
| 5 · Visualizaciones y accesibilidad | 26 nov 2026 | Pendiente | |
| EXIS | 4 dic 2026 | Pendiente | |

### Uso de inteligencia artificial

| Herramienta | Para qué | Alcance |
|---|---|---|
| Claude (Anthropic) | Borrador del contrato OpenAPI, del modelo de datos, del prototipo HTML/CSS/JS y de la documentación, a partir del anteproyecto y de la versión de escritorio del equipo (`core.py`). También como guía paso a paso para organizar el repositorio, publicar en GitHub Pages y tomar las evidencias | El equipo definió el problema, los usuarios, la ruta H, los roles y el modelo de cálculo base. Revisó el contenido generado, ajustó los roles al formato de conformación, reorganizó el repositorio, corrigió los enlaces, validó el contrato con Swagger Editor y Prism y auditó la accesibilidad con Lighthouse. Los precios, peajes y porcentajes de merma son estimaciones pendientes de validar con ganaderos |

### Licencia

MIT. Ver [`LICENSE`](LICENSE).
