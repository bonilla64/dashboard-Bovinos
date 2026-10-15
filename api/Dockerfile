# Imagen de la API · Dockerfile multietapa
# Etapa 1 instala solo dependencias de producción; etapa 2 copia lo mínimo y corre sin privilegios.

FROM node:22-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine AS ejecucion
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY package.json openapi.yaml ./
COPY src ./src
COPY scripts ./scripts
COPY db ./db
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Al arrancar: aplica migraciones pendientes, carga datos de demostración si la base está vacía y abre el puerto.
CMD ["sh", "-c", "node scripts/migrar.js && node scripts/sembrar.js && node src/servidor.js"]
