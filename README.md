# Simulador de Destinos Ganaderos desde Yopal

Esta aplicación web le dice a un ganadero de Casanare si le conviene vender su lote de ganado en la finca o llevarlo a una subasta, feria o frigorífico. Para cada destino tiene en cuenta el precio por kilo, el flete, los peajes, la comisión y el peso que pierden los animales en el viaje.

**Úsela en línea, sin instalar nada:** https://bonilla64.github.io/dashboard-Bovinos/

Funciona en el celular, la tableta o el computador, en cualquier navegador actual (Chrome, Edge, Firefox o Safari).

> **Versión 0.3.0 (Entrega 3).** El tablero está conectado a la API: usted inicia sesión, registra su lote, el **servidor** calcula y guarda la comparación, y el historial queda en la base de datos.
>
> **Sobre los precios:** la página **Precios** muestra de dónde sale cada uno. Los que vienen con la instalación son estimaciones del equipo y aparecen marcados como *«Estimado, no es de Fedegán»* hasta que el administrador cargue el reporte semanal de Fedegán (sección 3.6). Revise esa página antes de tomar una decisión de venta.

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

Abra https://bonilla64.github.io/dashboard-Bovinos/, cree su cuenta de productor en **Ingresar** y registre su primer lote (sección 3). Funciona desde cualquier celular o computador con internet; sus lotes y su historial quedan guardados en el servidor.

> La primera consulta después de un rato sin uso puede tardar **hasta un minuto**, porque el servidor gratuito se apaga cuando nadie lo usa. La pantalla lo avisa con *«El servidor se está despertando…»*. Las siguientes consultas son inmediatas.

Si en cambio ve el aviso *«Versión de demostración, sin servidor»*, la API todavía no se ha publicado (sección 2.4): puede recorrer las pantallas con datos de ejemplo, pero no guardar.

Si la va a usar seguido en el celular, puede agregarla a la pantalla de inicio: en Android con Chrome, menú ⋮ → **Agregar a la pantalla principal**; en iPhone con Safari, **Compartir** → **Agregar a inicio**.

## 2. Instalarla en su computador

Para **usar** la aplicación no hay que instalar nada (sección 1). Esta sección es para quien la va a desarrollar, probar o publicar:

| Forma | Qué necesita | Cuándo usarla |
|---|---|---|
| **2.1 GitHub Codespaces** (recomendada para desarrollar) | Solo un navegador y una cuenta de GitHub | Si su computador no aguanta Docker. Corre en la nube, gratis hasta 60 horas al mes en cuentas personales |
| **2.2 Docker en su computador** | Docker Desktop y 8 GB de RAM | Si su equipo lo soporta |
| **2.3 Solo el tablero** | Python o Node.js | Para mirar las pantallas en modo demostración, sin guardar |
| **2.4 Publicarla en internet** | Cuentas gratuitas en Neon y Render | Una sola vez, para que la dirección de la sección 1 funcione para todos |

### 2.1 En la nube con GitHub Codespaces — unos 5 minutos

1. Entre a https://github.com/bonilla64/dashboard-Bovinos con su cuenta de GitHub.
2. Oprima el botón verde **Code** → pestaña **Codespaces** → **Create codespace on main**. Se abre un editor en el navegador y prepara todo solo (la primera vez tarda 2 o 3 minutos).
3. Cuando termine, en la terminal de abajo aparece:
   ```
   ✔ Se creó .env con claves aleatorias.
     Contraseña de las cuentas de demostración: demo-xxxxxxxx
   ```
   **Anote esa contraseña.** Si se le pasó, abra el archivo `.env` y búsquela en la línea `CONTRASENA_DEMO`.
4. En esa misma terminal escriba:
   ```bash
   docker compose up --build
   ```
   Está listo cuando aparece `Server listening at http://0.0.0.0:3000`.
5. Abra la pestaña **Ports** (al lado de *Terminal*). En la fila del puerto **3000**, clic derecho → **Port Visibility** → **Public**. Sin este paso el tablero no puede hablar con la API.
6. En la fila del puerto **8080**, oprima el ícono del globo 🌐 (*Open in Browser*). Se abre el tablero y le pide **Ingresar** (sección 3.1).

Para apagarlo, `Ctrl + C` en la terminal. El Codespace se detiene solo a los 30 minutos sin uso y conserva los datos; para volver, entre a https://github.com/codespaces, ábralo y repita los pasos 4 a 6.

### 2.2 En su computador con Docker — unos 10 minutos

**Lo que necesita**

| Programa | Versión | Dónde se descarga |
|---|---|---|
| Docker Desktop (incluye Docker Compose) | 4.30 o superior | https://www.docker.com/products/docker-desktop/ |
| Git | 2.40 o superior | https://git-scm.com/downloads |

En Windows, Docker Desktop pide activar WSL 2 la primera vez; acepte y reinicie. Antes de seguir, **abra Docker Desktop** y espere a que diga *Engine running*.

Compruebe en una terminal (en Windows: **Git Bash**):

```bash
docker --version
docker compose version
git --version
```

**Pasos**

1. **Descargue el proyecto:**
   ```bash
   git clone https://github.com/bonilla64/dashboard-Bovinos.git
   cd dashboard-Bovinos
   ```
2. **Cree su archivo de configuración** copiando la plantilla:
   ```bash
   cp .env.example .env
   ```
3. **Abra `.env` con un editor de texto** (Bloc de notas sirve) y llene estos tres valores:

   | Variable | Qué poner | Ejemplo |
   |---|---|---|
   | `POSTGRES_PASSWORD` | Una contraseña para la base de datos. Cámbiela también dentro de `DATABASE_URL` si va a usar la API sin Docker | `pasto-llanero-2026` |
   | `JWT_SECRET` | Un texto aleatorio de 32 caracteres o más. Genérelo con el comando de abajo | `9f4c…` (96 caracteres) |
   | `CONTRASENA_DEMO` | La contraseña que tendrán las cuentas de demostración (mínimo 10 caracteres) | `demo-ganadero-2026` |

   Para generar `JWT_SECRET`:
   ```bash
   docker run --rm node:22-alpine node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   El archivo `.env` es solo suyo: **nunca lo suba a GitHub** (ya está en `.gitignore`).

4. **Encienda todo:**
   ```bash
   docker compose up --build
   ```
   La primera vez tarda unos minutos descargando imágenes. Está listo cuando aparece `Server listening at http://0.0.0.0:3000`. Deje esa terminal abierta.

5. **Ábralo en el navegador:**

   | Qué | Dirección |
   |---|---|
   | Tablero | http://localhost:8080 |
   | Documentación interactiva de la API | http://localhost:3000/docs |
   | Estado del servicio | http://localhost:3000/api/v1/salud |

6. **Inicie sesión con una cuenta de demostración** (contraseña: la que puso en `CONTRASENA_DEMO`):

   | Correo | Rol | Qué puede hacer |
   |---|---|---|
   | `admin@simulador-ganadero.co` | Administrador | Todo, incluido crear destinos y registrar precios |
   | `hernando.rincon@correo.co` | Productor | Sus lotes y simulaciones (tiene 3 lotes) |
   | `luz.cardenas@correo.co` | Productor | Sus lotes y simulaciones |

   También puede crear su propia cuenta de productor desde la pantalla **Ingresar** (sección 3.1).

7. **Para apagarlo:** `Ctrl + C` en la terminal, o `docker compose down`. Sus datos se conservan. Para borrar todo y empezar de cero: `docker compose down -v`.

### 2.3 Solo el tablero (modo demostración, sin guardar)

Necesita Git y **Python 3.10+** (https://www.python.org/downloads/, marque «Add Python to PATH») o **Node.js 20+** (https://nodejs.org).

```bash
git clone https://github.com/bonilla64/dashboard-Bovinos.git
cd dashboard-Bovinos
python -m http.server 8080 --directory web
```

Con Node.js, el último comando es `npx --yes serve web -l 8080`. Abra http://localhost:8080 y apague con `Ctrl + C`.

Abierto así, en `localhost`, el tablero busca la API en `http://localhost:3000`; si no está encendida verá «No hubo respuesta de la API». Para recorrer las pantallas sin API, use la versión publicada (sección 1), que entra sola al modo demostración.

> **Importante:** no abra `index.html` con doble clic: el navegador bloquea las llamadas y la aplicación no carga.

### 2.4 Publicarla en internet (gratis, una sola vez) — unos 20 minutos

La aplicación queda en tres partes, todas con HTTPS y sin costo:

```
Navegador ──► GitHub Pages (tablero)  ──►  Render (API, Docker)  ──►  Neon (PostgreSQL + PostGIS)
```

**1. La base de datos en Neon**
1. Entre a https://neon.tech → **Sign up** con su cuenta de GitHub.
2. **Create project**: nombre `simulador-ganadero`, versión de Postgres **16**, región **AWS US East (N. Virginia)**.
3. En **Connection string** copie la cadena. Debe verse así y terminar en `sslmode=require`:
   `postgresql://usuario:clave@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require`
   Guárdela en un lugar seguro: **es una contraseña, no la pegue en el repositorio ni en el chat del grupo**.

La API crea sola las tablas y la extensión PostGIS la primera vez que arranca.

**2. La API en Render**
1. Entre a https://render.com → **Get Started** con su cuenta de GitHub, y autorice el acceso al repositorio `dashboard-Bovinos`.
2. **New → Blueprint** → elija el repositorio. Render lee el archivo `render.yaml` y propone el servicio `simulador-ganadero-api`.
3. Le pide dos valores:

   | Variable | Qué poner |
   |---|---|
   | `DATABASE_URL` | La cadena de Neon del paso anterior |
   | `CONTRASENA_DEMO` | La contraseña del administrador (`admin@simulador-ganadero.co`) y de las cuentas de demostración. Que sea **larga** (15 caracteres o más): con ella se cargan los precios |

   `JWT_SECRET` lo genera Render solo.
4. **Apply**. La primera publicación tarda unos 5 minutos. Cuando el servicio diga **Live**, copie su dirección (algo como `https://simulador-ganadero-api.onrender.com`) y compruebe:
   - `https://…onrender.com/api/v1/salud` → `{"estado":"ok","base_datos":"ok",…}`
   - `https://…onrender.com/docs` → la documentación interactiva.

**3. Conectar el tablero**
1. En GitHub abra `web/js/config.js` → lápiz ✏️ (*Edit*) y escriba la dirección de la API terminada en `/api/v1`:
   ```js
   window.SDG_CONFIG = {
     api: "https://simulador-ganadero-api.onrender.com/api/v1",
   };
   ```
2. **Commit changes** (en una rama y pull request, como el resto del trabajo). Al llegar a `main`, GitHub Pages se actualiza en 1 o 2 minutos.
3. Abra https://bonilla64.github.io/dashboard-Bovinos/: ya no dice «modo demostración» y pide **Ingresar**.

**4. Cargar los precios reales**
Ingrese como `admin@simulador-ganadero.co` y siga la sección 3.6. Desde ese momento, todos los productores ven precios de Fedegán.

**Mantenimiento**
- Cada cambio que llegue a `main` vuelve a publicar la API (Render) y el tablero (Pages) solos.
- El plan gratuito de Render apaga la API tras 15 minutos sin uso y la enciende con la siguiente consulta (hasta un minuto). Para una presentación, abra la página 2 minutos antes.
- Si cambia la dirección de la API, actualice `web/js/config.js` y `CORS_ORIGEN` en Render.
- Para que la tarea programada de precios escriba en esta base, guarde la cadena de Neon como secreto `DATABASE_URL` en GitHub (**Settings → Secrets and variables → Actions**).

## 3. Cómo usarla paso a paso

La aplicación tiene cinco pantallas. Desde el menú de arriba se llega a **Tablero**, **Registrar lote**, **Historial** y **Precios**; arriba a la derecha está su nombre y el botón **Salir**.

### 3.1 Ingresar o crear su cuenta

La primera vez que abra el tablero lo lleva a **Ingresar**.

- **Si ya tiene cuenta**, escriba su correo y contraseña y oprima **Ingresar**. Con la instalación de la sección 2 ya existen cuentas de demostración (tabla del paso 6 de la sección 2.2).
- **Si no tiene cuenta**, llene **Crear una cuenta de productor**: nombre completo, correo, una contraseña de **10 caracteres o más**, municipio y, si quiere, su celular (10 dígitos, empieza por 3). Al crearla queda adentro de una vez.

La sesión dura 8 horas. Cuando vence, la aplicación le pide ingresar de nuevo y lo devuelve a la pantalla donde estaba; nada de lo guardado se pierde.

Cada productor ve **solo sus lotes y sus simulaciones**. El administrador ve todo y es el único que puede cargar precios.

### 3.2 Registrar su lote y calcular

Entre a **Registrar lote** y llene el formulario:

| Campo | Qué escribir | Ejemplo |
|---|---|---|
| ¿Qué lote quiere comparar? | **Un lote nuevo**, o uno que ya registró (se llenan sus datos y puede corregirlos) | Un lote nuevo |
| Productor | Solo lo ve el administrador: a nombre de quién queda el lote | Hernando Rincón Barrera (Yopal) |
| Nombre del lote | Un nombre para reconocerlo después | Novillos cebados de octubre |
| Categoría | El tipo de animal. Define qué precio se aplica | Novillo gordo |
| Raza o cruce (opcional) | La raza, si la quiere anotar | Brahman comercial |
| Cantidad de animales | Entre 1 y 200 | 30 |
| Peso promedio por animal | En kilos, entre 80 y 900, con máximo un decimal. Si pesó todo el lote, divida el peso total entre el número de animales | 452 |
| Finca o hato (opcional) | Dónde están los animales | Finca La Esperanza |
| Municipio de origen | De dónde sale el camión. **Las distancias, el flete, los peajes y la merma se calculan desde aquí**; la lista de destinos muestra la distancia desde ese municipio | Yopal |
| Flete por kilómetro | Lo que cobra el transportador por kilómetro, por camión | 6500 |
| Animales por camión | Cuántos lleva cada camión (de 24 a 27 es lo usual) | 25 |
| El transportador paga los peajes | Márquelo si los peajes ya van incluidos en el flete | |
| Destinos a comparar | Marque al menos dos. Si el lote es de levante o de destete, los frigoríficos y plantas se desmarcan solos porque no compran esa categoría | |

Mientras escribe, el formulario muestra el **peso total** y **cuántos camiones** necesita.

La primera vez que alguien compara desde un municipio, el servidor calcula la ruta a cada destino y la guarda: por carretera con OpenStreetMap (OSRM) si el servicio responde, o estimada en línea recta ajustada por la forma de la vía. El tablero dice cuál de las dos usó.

Oprima **Calcular y ver en el tablero**. El lote se guarda, el servidor calcula con los precios vigentes de ese momento y lo lleva al tablero con el resultado. Si falta un dato o algo está fuera de rango, arriba aparece una lista con los problemas; toque cada uno para ir directo al campo. Si el servidor no puede calcular algún destino (por ejemplo, no tiene precio de esa categoría o el precio tiene más de 30 días), la lista le dice cuál: desmárquelo y vuelva a calcular. El lote ya quedó guardado, así que no se duplica.

### 3.3 Leer el tablero

El tablero muestra su comparación más reciente (o la que abrió desde el historial). Arriba dice cuándo la calculó el servidor; con **Recalcular con los precios de hoy** se hace de nuevo con los mismos datos y los precios actuales, y queda guardada como una comparación nueva.

Luego responde la pregunta en una frase, por ejemplo:

> **Véndalo en la finca.** Le quedan $137 millones, sin pagar flete ni comisión: el comprador recoge el ganado. Son $1 millón más que en Subasta Ganadera de Yopal.

Debajo hay tres vistas que muestran lo mismo de forma distinta:

- **Mapa.** Las rutas desde el municipio del lote. La ruta dorada es el mejor destino y la verde es la que usted seleccionó. La venta en finca no tiene ruta porque no hay viaje. Las rutas estimadas se dibujan en línea recta.
- **Gráfico «Cuánto gana o pierde frente a vender cerca».** Compara cada destino con vender en el lugar más cercano. Las barras hacia la derecha significan que gana más que vendiendo cerca; las rojas hacia la izquierda, que pierde.
- **Tabla de comparación.** El detalle de cada destino, ordenado de mayor a menor utilidad:

| Columna | Qué significa |
|---|---|
| Distancia y Tiempo | Kilómetros y horas de viaje desde el municipio del lote |
| Merma | Porcentaje de peso que pierden los animales en el viaje |
| Precio por kg | Lo que paga ese destino por kilo en pie, y debajo su equivalente **por arroba** (@ = 12,5 kg) y la **fecha del precio**. Si tiene más de 7 días aparece un aviso en amarillo |
| Flete | Lo que cuesta el camión hasta ese destino |
| Peajes | Peajes estimados de la ruta, por cada camión |
| Comisión | Lo que cobra la subasta sobre el valor de la venta (3 %) |
| Utilidad neta | Lo que le queda: lo que le pagan menos flete, peajes y comisión |

Toque un destino en el gráfico, en la tabla (**Ver en mapa**) o en el mapa: se resalta en las tres vistas a la vez.

Para ver menos destinos, use los **filtros**: marque o desmarque los tipos (venta en finca, subastas, ferias, frigoríficos, plantas de beneficio) o mueva **Distancia máxima**. **Quitar filtros** vuelve a mostrar todos.

Para cambiar el lote o el flete, use **Cambiar lote o flete**: abre el formulario con los mismos datos y destinos. **Comparar otro lote** abre el formulario vacío.

### 3.4 Revisar el historial

En **Historial** están todas sus comparaciones guardadas en el servidor, de la más reciente a la más antigua.

- Busque por nombre del lote, finca o productor, o filtre por mejor destino.
- Toque **Ver detalle** para ver el resultado de cada destino, con la fecha de cada precio usado.
- **Abrir en el tablero** muestra esa comparación con los precios del día en que se hizo. Desde ahí puede **recalcular con los precios de hoy**.
- **Editar el lote y recalcular** abre el formulario con ese lote, el mismo flete y los mismos destinos.
- **Eliminar** borra la comparación del historial (pide confirmación). El lote no se borra.

### 3.5 Usarla solo con el teclado o con lector de pantalla

- La tecla **Tab** recorre todos los botones, filtros y campos, y **Enter** los activa. El elemento activo siempre se ve con un borde azul.
- La primera parada de Tab es **Saltar al contenido**, que lleva directo a la información.
- El mapa no es necesario para usar la aplicación: la tabla y el gráfico tienen la misma información y los lectores de pantalla los leen.

### 3.6 Precios: ver de dónde salen y cargar los de Fedegán

La pantalla **Precios** la puede ver cualquiera. Muestra, para cada destino y categoría, el precio más reciente con su **fecha**, su **fuente** y su estado:

| Estado | Qué significa |
|---|---|
| Al día | El precio tiene 7 días o menos |
| Con advertencia | Tiene entre 8 y 30 días. Se usa, pero el resultado sale con aviso |
| Vencido | Tiene más de 30 días. Ese destino **no se compara** hasta que se actualice |
| Estimado, no es de Fedegán | La fuente no es Fedegán (por ejemplo, los precios de demostración). Hay que reemplazarlo |

**Cargar los precios de la semana (solo administrador).** Fedegán publica cada semana los precios del ganado en pie por plaza, en su portal de estadísticas (https://estadisticas.fedegan.org.co, sección de precios) y en la serie «Precio del ganado, semana del … al …» de Contexto Ganadero (https://www.contextoganadero.com). Con esos datos:

1. Ingrese como administrador y abra **Precios**.
2. Oprima **Descargar la hoja con los precios actuales**. Se descarga un CSV que se abre en Excel o Google Sheets.
3. En cada fila cambie `precio_kg_cop` por el precio del reporte (solo el número, en pesos por kilo), `fecha` por la fecha del reporte (`AAAA-MM-DD` o `DD/MM/AAAA`) y `fuente` por algo como *Fedegán – precios semanales, semana del 6 al 10 de octubre*. La columna `referencia` dice qué plaza del reporte corresponde a cada destino; no cambie la columna `destino`.
4. Guarde como **CSV** y súbalo en **Cargar precios de Fedegán**.

Si alguna fila tiene un error, **no se guarda ninguna** y la pantalla dice qué fila y qué columna corregir (por ejemplo *«fila 3.destino: No existe un destino llamado…»*). Si todo está bien, muestra cuántos precios quedaron nuevos, cuántos cambiaron y cuántos quedaron iguales, y las comparaciones siguientes ya los usan. Las comparaciones guardadas antes no cambian: conservan el precio con que se hicieron. En **Últimas cargas** queda registro de cada carga.

También se puede automatizar cada 3 días desde una hoja de Google publicada: ver [`docs/precios/README.md`](docs/precios/README.md).

### 3.7 Usar la API desde la documentación interactiva

Con la API encendida (sección 2), abra `/docs` en la dirección de la API (en su computador, http://localhost:3000/docs; en Codespaces, la dirección del puerto 3000 terminada en `/docs`):

1. Busque **Autenticación → POST /auth/ingreso**, haga clic en **Try it out**, escriba un correo de demostración y su contraseña, y oprima **Execute**. Copie el valor de `token` de la respuesta.
2. Arriba a la derecha, oprima **Authorize**, pegue el token y oprima **Authorize** otra vez.
3. Ahora puede probar cualquier operación. Por ejemplo, **Simulaciones → POST /simulaciones** con el lote `9bad2b17-c8e0-57f7-ac48-2d1cf99ad088` (de Hernando) y los destinos `0e6f6c1a-3b0d-5c8e-9f1a-6d2b7c4e8a10` (finca) y `52bbc2f4-901c-5ff0-a08a-5f8f08f91fa1` (Frigorífico Guadalupe).

Si intenta ver un lote de otro productor, la API responde 403: cada productor solo ve lo suyo.

## 4. Cómo se calcula lo que le queda

Para cada destino:

```
Camiones            = animales ÷ animales por camión (25), redondeado hacia arriba
Peso que llega      = peso total del lote × (1 − merma %)
Lo que le pagan     = peso que llega × precio por kilo del destino
Comisión            = lo que le pagan × comisión del destino (3 % en subastas)
Flete               = distancia × flete por km × recargo de la vía × camiones
Peajes              = peajes de la ruta × camiones (0 si el transportador los paga)
Utilidad neta       = lo que le pagan − (flete + peajes + comisión)
```

Las distancias se cuentan desde el **municipio del lote**. Desde Yopal están medidas; desde los demás municipios de Casanare se miden con OSRM o se estiman (línea recta × la sinuosidad de la vía hacia ese destino; si el destino está al otro lado de la cordillera y el municipio queda detrás de Yopal, por Yopal). La merma y los peajes de una ruta estimada se interpolan con las rutas medidas de distancia parecida.

El **recargo de la vía** sube el flete en carreteras de montaña: por ejemplo, 25 % más hacia Bogotá y 40 % más hacia Medellín.

**Ejemplo con 30 novillos de 452 kg (13.560 kg), flete de $7.000 por km, 2 camiones:**

| | Venta en finca | Subasta de Yopal | Frigorífico Guadalupe (Bogotá) |
|---|---|---|---|
| Distancia | 0 km | 9,5 km | 382 km |
| Merma | 0 % → 13.560 kg | 0,5 % → 13.492 kg | 7,7 % → 12.516 kg |
| Precio por kilo | $10.100 | $10.400 | $11.300 |
| Lo que le pagan | $137,0 millones | $140,3 millones | $141,4 millones |
| Comisión | $0 | $4,2 millones | $0 |
| Flete y peajes | $0 | $0,1 millones | $6,9 millones |
| **Le queda** | **$137,0 millones** | **$136,0 millones** | **$134,5 millones** |

Bogotá paga $1.200 más por kilo que la finca, pero los animales pierden más de 1.000 kg en el viaje y el transporte de dos camiones cuesta $6,9 millones. Por eso, en este caso, conviene vender en la finca. Los porcentajes de merma salen de una entrevista con un ganadero de Yopal (ver `docs/decisiones.md`, D-13 y D-18).

## 5. Si algo no funciona

| Lo que ve | Qué pasó | Qué hacer |
|---|---|---|
| «No hubo respuesta de la API en …» | La API está apagada o la dirección no es la correcta | Encienda la API (`docker compose up`) y toque **Volver a intentar**. Revise la dirección en **Ingresar → Conexión con el servidor** |
| Lo mismo, en Codespaces | El puerto 3000 está en *Private* | Pestaña **Ports** → clic derecho en 3000 → **Port Visibility → Public** |
| «Versión de demostración, sin servidor» | Abrió la página publicada en GitHub Pages | Es normal: no guarda. Para guardar, siga la sección 2 |
| «Correo o contraseña incorrectos» | Datos mal escritos, o la contraseña de demostración es otra | La contraseña de demostración es la de `CONTRASENA_DEMO` en `.env` |
| «Su sesión venció» | Pasaron 8 horas | Ingrese de nuevo; sus datos siguen guardados |
| Tarda mucho la primera vez y sale «El servidor se está despertando» | El servidor gratuito estaba apagado por falta de uso | Espere hasta un minuto; después responde normal |
| «El lote se guardó, pero no se pudo calcular» | Un destino marcado no tiene precio vigente para esa categoría | Desmarque ese destino, o pídale al administrador que cargue el precio |
| Un precio dice «Vencido» | Tiene más de 30 días | El administrador debe cargar la hoja de Fedegán (sección 3.6) |
| «El archivo tiene N problema(s); no se guardó ningún precio» | Alguna fila del CSV está mal | Corrija la fila y columna que indica la lista y vuelva a subirlo |
| «Ningún destino cumple los filtros» | Los filtros dejaron la lista vacía | Toque **Mostrar todos los destinos** o amplíe la distancia máxima |
| El mapa se ve sin calles ni ciudades | El fondo del mapa necesita internet | Las rutas, el gráfico y la tabla siguen funcionando |
| `Defina JWT_SECRET en .env` al hacer `docker compose up` | Falta llenar `.env` | Siga el paso 3 de la sección 2.2 |
| `JWT_SECRET debe tener al menos 32 caracteres` | El secreto es muy corto | Genere uno con el comando del paso 3 |
| `Cannot connect to the Docker daemon` o `error during connect` | Docker Desktop no está abierto | Ábralo y espere a que diga *Engine running* |
| `port is already allocated` o `Address already in use` | El puerto 3000 u 8080 está ocupado | En `.env` cambie `API_PUERTO` o `WEB_PUERTO` (por ejemplo a 3001) |
| En `/docs`, la API responde 401 | Falta el token, o venció (dura 8 horas) | Inicie sesión de nuevo y use **Authorize** |
| Inicio de sesión responde 429 | Más de 10 intentos en un minuto | Espere un minuto |
| No puede entrar con las cuentas de demostración | `CONTRASENA_DEMO` estaba vacía la primera vez | `docker compose down -v` y vuelva a `docker compose up --build` con la contraseña puesta (esto borra los datos guardados) |
| `python no se reconoce como un comando` | Python no está en el PATH | Pruebe `python3` o `py`, o reinstale marcando «Add Python to PATH» |

## 6. Preguntas frecuentes

**¿Los precios son reales?**
Son tan reales como los últimos que cargó el administrador. La pantalla **Precios** dice la fecha y la fuente de cada uno y marca los que no vienen de Fedegán. Si un precio tiene más de 7 días, el resultado lo advierte; si tiene más de 30, ese destino no se compara.

**¿Quién calcula el resultado, mi celular o el servidor?**
El servidor. El tablero solo envía el lote, el flete y los destinos; el servidor busca los precios y las rutas, calcula y guarda. Así todos ven el mismo resultado y nadie puede alterar las cifras desde el navegador.

**¿Dónde quedan guardados mis lotes?**
En la base de datos PostgreSQL de la API, ligados a su cuenta. Puede entrar desde otro celular o computador y los encuentra igual.

**¿Otro productor puede ver mis lotes?**
No. Cada productor solo ve y modifica sus propios lotes y simulaciones. Solo el administrador ve todo.

**¿Mi contraseña queda guardada?**
No. Se guarda una huella cifrada con bcrypt, de la que no se puede recuperar la contraseña.

**¿Por qué a veces conviene vender cerca aunque paguen menos por kilo?**
Porque en viajes largos el ganado pierde peso y el flete sube. La aplicación lo tiene en cuenta; por eso el destino con mejor precio por kilo no siempre es el que más deja.

**¿Por qué los precios aparecen también en arrobas?**
Porque en los Llanos el ganado se negocia mucho por arroba. El cálculo se hace por kilo; la arroba (12,5 kg) es solo para comparar con lo que le ofrecen.

**Mi finca no queda en la cabecera del municipio. ¿Cambia algo?**
La ruta se mide desde la cabecera municipal. Si su finca queda lejos de ella, sume esa distancia mentalmente o escriba un flete por km un poco más alto.

**¿Qué hago si mi transportador cobra distinto?**
Escriba su valor real en **Valor del flete por kilómetro** y vuelva a calcular.

---

## 7. Para desarrolladores

### Arquitectura

```
Navegador ──► web/ (nginx, :8080)            Tablero: HTML, CSS, JS y Leaflet
   │            js/api.js: token JWT, dirección de la API y errores
   └── fetch ─► api/ (Fastify, :3000)          API REST /api/v1 + documentación /docs
                  │  valida con api/openapi.yaml (el contrato es la fuente de verdad)
                  ▼
              db (PostgreSQL 16 + PostGIS 3)  Datos, geometrías y consultas espaciales
```

### Estructura del proyecto

```
├── README.md
├── docker-compose.yml       db + api + web con un solo comando
├── .devcontainer/           Configuración de GitHub Codespaces (crea .env con claves aleatorias)
├── render.yaml              Publicación de la API en Render (sección 2.4)
├── .env.example             Variables necesarias, sin valores reales
├── .github/workflows/       Pages, validación del contrato, pruebas e imagen de la API
├── api/
│   ├── openapi.yaml         Contrato OpenAPI 3.1 (6 recursos + autenticación)
│   ├── Dockerfile           Imagen multietapa, corre sin privilegios
│   ├── src/                 app.js, contrato.js, auth.js, calculo.js, errores.js, rutas/
│   ├── src/geo/origenes.js  Rutas desde el municipio del lote (OSRM o estimación)
│   ├── db/migraciones/      Esquema SQL versionado
│   ├── db/semilla/          Datos de demostración del caso regional
│   ├── scripts/             migrar, sembrar, exportar-prototipo
│   └── test/                Pruebas unitarias, de integración y de contrato
├── docs/                    Modelo de datos, decisiones, wireframes y evidencias
└── web/                     Tablero: ingreso, tablero, registrar lote, historial y precios
    └── js/                  config.js (dirección de la API publicada), api.js (cliente), app.js (pantallas)
```

### Operaciones de la API

Base: `http://localhost:3000/api/v1`. 🔒 = requiere `Authorization: Bearer <token>`; 👑 = solo administrador.

| Recurso | Operaciones |
|---|---|
| Autenticación | `POST /auth/registro`, `POST /auth/ingreso`, 🔒 `GET /auth/yo` |
| Productores | 👑 `GET`, 👑 `POST /productores` · 🔒 `GET`, 🔒 `PATCH`, 👑 `DELETE /productores/{id}` |
| Lotes | 🔒 `GET`, `POST /lotes` · 🔒 `GET`, `PATCH`, `DELETE /lotes/{id}` |
| Destinos | `GET /destinos` (con filtro espacial `cerca_lat`, `cerca_lon`, `radio_km`), 👑 `POST` · `GET`, 👑 `PATCH`, 👑 `DELETE /destinos/{id}` |
| Precios | `GET`, 👑 `POST /destinos/{id}/precios` · 👑 `PATCH`, 👑 `DELETE /precios/{id}` · 👑 `POST /precios/importacion` (CSV), 👑 `GET /precios/importaciones` |
| Rutas | `GET`, 👑 `POST /rutas` · `GET`, 👑 `PATCH`, 👑 `DELETE /rutas/{id}` |
| Simulaciones | 🔒 `GET`, `POST /simulaciones` · 🔒 `GET`, `DELETE /simulaciones/{id}` |
| Sistema | `GET /salud` |

Todos los errores responden `{ codigo, mensaje, detalles[] }`: 400 petición mal formada, 401 sin sesión, 403 sin permiso, 404 no existe, 409 conflicto, 422 validación, 429 demasiados intentos.

### Correr la API sin Docker

Requiere Node.js 22 y PostgreSQL 16 con PostGIS 3 instalados, y `DATABASE_URL`, `JWT_SECRET` y `CONTRASENA_DEMO` en `.env`.

```bash
cd api
npm ci
set -a; source ../.env; set +a      # carga las variables (Git Bash, macOS o Linux)
npm run migrar                        # crea las tablas
npm run sembrar                       # carga los datos de demostración (--forzar para recargar)
npm run dev                           # http://localhost:3000, se reinicia al guardar
```

### Pruebas automáticas

81 pruebas de la API: cálculo, rutas desde otros municipios, vigencia e importación de precios, autenticación, autorización, validación, filtro espacial, CRUD de todos los recursos, coherencia contrato ↔ base de datos y validación de **cada respuesta contra el contrato**. Usan una base aparte, que se borra en cada ejecución: si `DATABASE_URL_PRUEBAS` falta o es igual a `DATABASE_URL`, las pruebas se niegan a correr para no borrar los precios reales.

```bash
cd api
DATABASE_URL_PRUEBAS=postgresql://ganadero:SU_CLAVE@localhost:5432/simulador_ganadero_pruebas npm test
```

Con Docker, sin instalar nada más:

```bash
docker compose up -d db
docker compose exec db createdb -U ganadero simulador_ganadero_pruebas
docker run --rm --network dashboard-bovinos_default -v "$PWD/api:/app" -w /app \
  -e DATABASE_URL_PRUEBAS=postgresql://ganadero:SU_CLAVE@db:5432/simulador_ganadero_pruebas \
  node:22-alpine sh -c "npm ci && npm test"
```

En GitHub, el workflow **API · pruebas e imagen** corre las pruebas contra PostGIS, construye la imagen, levanta el `docker compose` y hace una prueba de humo en cada pull request.

### Actualizar los precios (fuente: Fedegán)

Los precios salen de los reportes semanales de Fedegán, pasados a una hoja de Google que la tarea **Precios · sincronizar desde Fedegán** importa cada 3 días. Cada resultado muestra la fecha del precio: con más de 7 días lleva advertencia y con más de 30 el destino no se compara. Instrucciones completas: [`docs/precios/README.md`](docs/precios/README.md). Plantilla: [`docs/precios/plantilla-fedegan.csv`](docs/precios/plantilla-fedegan.csv).

### Validar el contrato

```bash
cd api && npm run contrato:validar
```

### Dirección de la API que usa el tablero

`web/js/api.js` decide a qué API llamar, en este orden: `?api=https://…/api/v1` en la URL (queda guardada), la dirección escrita en **Ingresar → Conexión con el servidor**, la de Codespaces (cambia `-8080` por `-3000`), `http://<mismo equipo>:3000/api/v1` en localhost y red local, y por último la de `web/js/config.js` (la API publicada, sección 2.4). Si ninguna aplica, usa el **modo demostración**, de solo lectura, con `web/datos/ejemplo.json`. La API debe permitir el origen del tablero en `CORS_ORIGEN`.

### Actualizar los datos del modo demostración

El modo demostración lee `web/datos/ejemplo.json`. Para que muestre lo mismo que la base de datos:

```bash
cd api && npm run exportar:prototipo
```

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
| 2 · Prototipo y contrato | 1 oct 2026 | Entregada (`v0.2.0`) | Prototipo navegable de 3 pantallas con estados, contrato OpenAPI 3.1 con 6 recursos, modelo de datos |
| 3 · MVP del backend | 15 oct 2026 | **En curso** (`v0.3.0`) | API REST con CRUD de 6 recursos, autenticación JWT + bcrypt, autorización por rol y por dueño, validación desde el contrato, errores centralizados, PostgreSQL + PostGIS, Swagger en `/docs`, Docker Compose y Codespaces, precios de Fedegán con vigencia y carga por CSV desde el tablero, tablero conectado a la API (ingreso, registro, cálculo en el servidor, historial y precios), rutas desde el municipio del lote, precios en kg y arroba, publicación en internet (Render + Neon + Pages), 81 pruebas en CI, ajustes de la entrevista |
| 4 · Mapa desplegado con HTTPS | 12 nov 2026 | Pendiente | |
| 5 · Visualizaciones y accesibilidad | 26 nov 2026 | Pendiente | |
| EXIS | 4 dic 2026 | Pendiente | |

### Uso de inteligencia artificial

| Herramienta | Para qué | Alcance |
|---|---|---|
| Claude (Anthropic) | Borrador del contrato OpenAPI, del modelo de datos, del prototipo HTML/CSS/JS y de la documentación, a partir del anteproyecto y de la versión de escritorio del equipo (`core.py`). También como guía paso a paso para organizar el repositorio, publicar en GitHub Pages y tomar las evidencias | El equipo definió el problema, los usuarios, la ruta H, los roles y el modelo de cálculo base. Revisó el contenido generado, ajustó los roles al formato de conformación, reorganizó el repositorio, corrigió los enlaces, validó el contrato con Swagger Editor y Prism y auditó la accesibilidad con Lighthouse. Los precios, peajes y porcentajes de merma son estimaciones pendientes de validar con ganaderos |
| Claude (Anthropic), Entrega 3 | Borrador del código de la API (Fastify, autenticación, validación, errores, migraciones, pruebas), de la conexión del tablero con la API (`web/js/api.js`, `web/js/app.js`, pantallas de ingreso y precios), del Dockerfile, del docker compose, de la configuración de Codespaces y Render, de las rutas desde cada municipio, del workflow de CI y de esta documentación, a partir del contrato y del modelo de la Entrega 2 y de la entrevista al ganadero | El equipo decidió el alcance, los roles de usuario y los ajustes de la entrevista, y debe poder explicar cada archivo en la sustentación. COMPLETAR: qué cambió el equipo en esta entrega |

### Licencia

MIT. Ver [`LICENSE`](LICENSE).
