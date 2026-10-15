#!/usr/bin/env bash
# Crea el archivo .env del Codespace con claves aleatorias (solo la primera vez).
# El .env nunca se sube al repositorio: está en .gitignore.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo "Ya existe .env; no se cambia."
  exit 0
fi

clave_bd=$(openssl rand -hex 16)
jwt=$(openssl rand -hex 48)
demo="demo-$(openssl rand -hex 4)"

sed -e "s/CAMBIE_ESTA_CLAVE/${clave_bd}/g" \
    -e "s/^JWT_SECRET=.*/JWT_SECRET=${jwt}/" \
    -e "s/^CONTRASENA_DEMO=.*/CONTRASENA_DEMO=${demo}/" \
    -e "s#^CORS_ORIGEN=.*#CORS_ORIGEN=http://localhost:8080,https://*.app.github.dev#" \
    .env.example > .env

echo
echo "✔ Se creó .env con claves aleatorias."
echo "  Contraseña de las cuentas de demostración: ${demo}"
echo "  (también la ve en el archivo .env, línea CONTRASENA_DEMO)"
echo
echo "Siguiente paso, en esta terminal:  docker compose up --build"
