// Configuración leída de variables de entorno (ver .env.example en la raíz del repositorio).
// Ningún secreto tiene valor por defecto: si falta, la API se niega a arrancar.

function requerida(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}. Revise el archivo .env (copie .env.example).`);
  return valor;
}

// CORS_ORIGEN es una lista separada por comas. Un `*` dentro de un origen sirve de comodín
// para un solo subdominio, p. ej. https://*.app.github.dev (Codespaces) o https://*.github.io.
export function origenesCors(texto) {
  return texto.split(',').map((s) => s.trim()).filter(Boolean).map((o) => {
    if (!o.includes('*')) return o;
    const patron = o.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\/]/g, '\\$&')).join('[a-z0-9-]+');
    return new RegExp(`^${patron}$`, 'i');
  });
}

export function leerConfig() {
  const jwtSecreto = requerida('JWT_SECRET');
  if (jwtSecreto.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres. Genere uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  }
  return {
    entorno: process.env.NODE_ENV || 'development',
    puerto: Number(process.env.PORT || 3000),
    host: process.env.HOST || '0.0.0.0',
    baseDatosUrl: requerida('DATABASE_URL'),
    jwtSecreto,
    jwtExpiraSegundos: Number(process.env.JWT_EXPIRA_SEGUNDOS || 8 * 60 * 60),
    corsOrigen: origenesCors(process.env.CORS_ORIGEN || 'http://localhost:8080,http://127.0.0.1:8080'),
    nivelLog: process.env.LOG_LEVEL || 'info',
    // Servidor de rutas por carretera. Vacío = rutas estimadas (línea recta × sinuosidad).
    osrmBaseUrl: process.env.OSRM_BASE_URL || '',
    // Número de proxies delante de la API (Render = 1). 0 o vacío = ninguno.
    confiarProxy: Number(process.env.TRUST_PROXY || 0) || false,
    costoBcrypt: Number(process.env.BCRYPT_COSTO || 12),
    // Vigencia de precios: con más días que `advertencia` el resultado sale con aviso;
    // con más días que `maximo` el destino no se compara.
    vigenciaPrecios: {
      advertencia: Number(process.env.PRECIO_DIAS_ADVERTENCIA || 7),
      maximo: Number(process.env.PRECIO_DIAS_MAXIMO || 30),
    },
  };
}
