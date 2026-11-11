# Evidencias de la Entrega 4 · Despliegue contenerizado

Simulador de Destinos Ganaderos desde Yopal · Tecnologías Web 2026-B · Unitrópico · Versión `v0.5.0`

| Requisito | Dónde está la evidencia |
|---|---|
| Aplicación contenerizada, publicada con HTTPS válido | [Sección 1](#1-aplicación-contenerizada-y-publicada-con-https) |
| CI/CD que despliega solo desde `main` | [Sección 2](#2-cicd-despliegue-automático-desde-main) |
| Diagrama de arquitectura de despliegue | [Sección 3](#3-diagrama-de-arquitectura-de-despliegue) y [`docs/despliegue.md`](../../despliegue.md) |
| Informe comparativo con Lighthouse | [Sección 4](#4-informe-de-lighthouse) y [`docs/informe-rendimiento.md`](../../informe-rendimiento.md) |

En las capturas no aparecen la cadena de conexión de Neon, las variables de entorno de Render ni la URL del Deploy Hook. En las de Mi cuenta se difuminó el correo.

## 1. Aplicación contenerizada y publicada con HTTPS

| URL | Qué es |
|---|---|
| https://bonilla64.github.io/dashboard-Bovinos/ | Página web (GitHub Pages) |
| https://simulador-ganadero-api.onrender.com/api/v1/salud | API en un contenedor Docker en Render |
| https://simulador-ganadero-api.onrender.com/docs | Documentación interactiva de la API (Swagger) |

**Render construye el servicio desde `api/Dockerfile`** (Runtime Docker, Root Directory `api/`):

![Render: Dockerfile Path](docker-render.png)

**Certificado válido en la API:** el navegador muestra «La conexión es segura» y «El certificado es válido».

![HTTPS de la API](https-api.png)

**Certificado válido en la página:**

![HTTPS de la página](https-pagina.png)

## 2. CI/CD: despliegue automático desde `main`

Cómo funciona:

1. Se abre un Pull Request hacia `main`.
2. En el PR corren **API · pruebas e imagen** (122 pruebas más la construcción de la imagen con prueba de humo) y **Validar contrato OpenAPI**.
3. Al hacer merge corren de nuevo sobre `main`.
4. Render tiene Auto-Deploy en **After CI Checks Pass**, también declarado en `render.yaml` como `autoDeployTrigger: checksPass`. Así, solo publica el contenedor si esos checks salen en verde.

**Auto-Deploy configurado en Render:**

![Render: Auto-Deploy After CI Checks Pass](render-auto-deploy.png)

**Checks corriendo en el PR #31** (`version-0.5.0`):

![Checks del PR](pr-checks.png)

**Workflows en verde** sobre el PR #31 y luego sobre `main` tras el merge (commit `756364e`):

![GitHub Actions en verde](actions-verde.png)

**Render despliega solo ese mismo commit `756364e`:** «Deploy started… New commit via Auto-Deploy» y luego «Deploy live», sin intervención manual.

![Render Events](render-eventos.png)

**La API en producción quedó con la versión nueva:** `{"estado":"ok","base_datos":"ok","version":"0.5.0"}`.

![Versión 0.5.0 en /salud](version-050.png)

## 3. Diagrama de arquitectura de despliegue

El diagrama fuente, en Mermaid, está en [`docs/despliegue.md`](../../despliegue.md); GitHub lo dibuja solo.

![Arquitectura de despliegue](arquitectura-despliegue.png)

## 4. Informe de Lighthouse

El análisis completo está en [`docs/informe-rendimiento.md`](../../informe-rendimiento.md). Se midieron 7 páginas, cada una en móvil y en escritorio, el 11 de noviembre de 2026, con la sesión iniciada y «Clear storage» desmarcado.

| Página | Performance móvil | Performance escritorio | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|---|
| Ingreso | 95 | 74 | 100 | 100 | 100 |
| Tablero | 90 | 74 | 100 | 100 | 100 |
| Registrar lote (`detalle.html`) | 85 | 89 | 100 | 100 | 100 |
| Historial | 99 | 86 | 100 | 100 | 100 |
| Lotes | 80 | 89 | 100 | 100 | 100 |
| Mi cuenta | 89 | 92 | 100 | 100 | 100 |
| Administración | 87 | 94 | 100 | 100 | 100 |
| **Promedio** | **89,3** | **85,4** | **100** | **100** | **100** |

### Ingreso

| Móvil | Escritorio |
|---|---|
| ![Ingreso móvil](lh-ingreso-movil.png) | ![Ingreso escritorio](lh-ingreso-escritorio.png) |

### Tablero

| Móvil | Escritorio |
|---|---|
| ![Tablero móvil](lh-index-movil.png) | ![Tablero escritorio](lh-index-escritorio.png) |

### Registrar lote

| Móvil | Escritorio |
|---|---|
| ![Registrar lote móvil](lh-detalle-movil.png) | ![Registrar lote escritorio](lh-detalle-escritorio.png) |

### Historial

| Móvil | Escritorio |
|---|---|
| ![Historial móvil](lh-historial-movil.png) | ![Historial escritorio](lh-historial-escritorio.png) |

### Lotes

| Móvil | Escritorio |
|---|---|
| ![Lotes móvil](lh-lotes-movil.png) | ![Lotes escritorio](lh-lotes-escritorio.png) |

### Mi cuenta

| Móvil | Escritorio |
|---|---|
| ![Mi cuenta móvil](lh-cuenta-movil.png) | ![Mi cuenta escritorio](lh-cuenta-escritorio.png) |

### Administración

| Móvil | Escritorio |
|---|---|
| ![Administración móvil](lh-admin-movil.png) | ![Administración escritorio](lh-admin-escritorio.png) |
