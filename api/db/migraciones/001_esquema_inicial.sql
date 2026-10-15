-- 001 · Esquema inicial del Simulador de Destinos Ganaderos (Entrega 3)
-- Corresponde a docs/modelo-datos.md. Cada cambio posterior va en un archivo nuevo (002_..., 003_...).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE categoria_animal AS ENUM ('novillo_gordo','vaca_gorda','novillo_levante','ternero_destete','toro');
CREATE TYPE estado_lote      AS ENUM ('disponible','simulado','vendido');
CREATE TYPE tipo_destino     AS ENUM ('finca','subasta','feria','frigorifico','planta_beneficio');
CREATE TYPE fuente_ruta      AS ENUM ('osrm','manual','respaldo_linea_recta');
CREATE TYPE rol_usuario      AS ENUM ('administrador','productor');

-- Mantiene actualizado_en sin depender de que el código lo recuerde.
CREATE OR REPLACE FUNCTION marcar_actualizado() RETURNS trigger AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE productor (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_completo varchar(120) NOT NULL CHECK (char_length(nombre_completo) >= 3),
  municipio       varchar(60)  NOT NULL,
  telefono        varchar(10)  CHECK (telefono ~ '^3[0-9]{9}$'),
  correo          varchar(120),
  creado_en       timestamptz  NOT NULL DEFAULT now(),
  actualizado_en  timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX productor_correo_uq ON productor (lower(correo)) WHERE correo IS NOT NULL;
CREATE INDEX productor_municipio_idx ON productor (municipio);

CREATE TABLE usuario (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_completo varchar(120) NOT NULL,
  correo          varchar(120) NOT NULL,
  contrasena_hash varchar(100) NOT NULL,               -- bcrypt, nunca la contraseña
  rol             rol_usuario  NOT NULL DEFAULT 'productor',
  productor_id    uuid UNIQUE REFERENCES productor(id) ON DELETE SET NULL,
  creado_en       timestamptz  NOT NULL DEFAULT now(),
  actualizado_en  timestamptz  NOT NULL DEFAULT now(),
  CHECK (rol = 'administrador' OR productor_id IS NOT NULL)
);
CREATE UNIQUE INDEX usuario_correo_uq ON usuario (lower(correo));

CREATE TABLE lote (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  productor_id      uuid NOT NULL REFERENCES productor(id) ON DELETE RESTRICT,
  nombre            varchar(80) NOT NULL CHECK (char_length(nombre) >= 3),
  cantidad_animales integer NOT NULL CHECK (cantidad_animales BETWEEN 1 AND 200),
  peso_promedio_kg  numeric(5,1) NOT NULL CHECK (peso_promedio_kg BETWEEN 80 AND 900),
  peso_total_kg     numeric(8,1) GENERATED ALWAYS AS (cantidad_animales * peso_promedio_kg) STORED,
  categoria         categoria_animal NOT NULL,
  raza              varchar(40),
  finca             varchar(80),
  municipio_origen  varchar(60) NOT NULL,
  estado            estado_lote NOT NULL DEFAULT 'disponible',
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lote_productor_idx        ON lote (productor_id);
CREATE INDEX lote_estado_categoria_idx ON lote (estado, categoria);
CREATE INDEX lote_creado_idx           ON lote (creado_en DESC);

CREATE TABLE destino (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         varchar(100) NOT NULL UNIQUE,
  tipo           tipo_destino NOT NULL,
  municipio      varchar(60)  NOT NULL,
  departamento   varchar(60)  NOT NULL,
  ubicacion      geometry(Point, 4326) NOT NULL,
  comision_pct   numeric(4,2) NOT NULL DEFAULT 0 CHECK (comision_pct BETWEEN 0 AND 15),
  activo         boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX destino_ubicacion_gix    ON destino USING GIST (ubicacion);
-- Índice sobre geography: lo usa ST_DWithin en metros para el filtro «destinos a menos de N km».
CREATE INDEX destino_ubicacion_geog_gix ON destino USING GIST ((ubicacion::geography));
CREATE INDEX destino_tipo_idx         ON destino (tipo);
CREATE INDEX destino_departamento_idx ON destino (departamento);

CREATE TABLE precio_mercado (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destino_id     uuid NOT NULL REFERENCES destino(id) ON DELETE CASCADE,
  categoria      categoria_animal NOT NULL,
  precio_kg_cop  integer NOT NULL CHECK (precio_kg_cop BETWEEN 3000 AND 30000),
  fecha          date NOT NULL,
  fuente         varchar(160) NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX precio_destino_cat_fecha_uq ON precio_mercado (destino_id, categoria, fecha DESC);

CREATE TABLE ruta (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destino_id        uuid NOT NULL REFERENCES destino(id) ON DELETE CASCADE,
  origen_nombre     varchar(80) NOT NULL DEFAULT 'Yopal (centro de acopio)',
  origen            geometry(Point, 4326) NOT NULL,
  distancia_km      numeric(6,1) NOT NULL CHECK (distancia_km BETWEEN 0 AND 3000),
  tiempo_horas      numeric(4,1) NOT NULL CHECK (tiempo_horas BETWEEN 0 AND 72),
  peajes_cop        integer NOT NULL DEFAULT 0 CHECK (peajes_cop >= 0),
  factor_dificultad numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (factor_dificultad BETWEEN 1 AND 2),
  merma_pct         numeric(4,1) NOT NULL DEFAULT 0 CHECK (merma_pct BETWEEN 0 AND 15),
  geometria         geometry(LineString, 4326) NOT NULL,
  fuente            fuente_ruta NOT NULL DEFAULT 'manual',
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ruta_destino_origen_uq ON ruta (destino_id, origen_nombre);
CREATE INDEX ruta_geometria_gix ON ruta USING GIST (geometria);

CREATE TABLE simulacion (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id              uuid NOT NULL REFERENCES lote(id) ON DELETE RESTRICT,
  flete_km_cop         integer NOT NULL CHECK (flete_km_cop BETWEEN 1000 AND 50000),
  capacidad_camion     smallint NOT NULL DEFAULT 25 CHECK (capacidad_camion BETWEEN 5 AND 40),
  flete_incluye_peajes boolean NOT NULL DEFAULT false,
  mejor_destino_id     uuid NOT NULL REFERENCES destino(id),
  creado_en            timestamptz NOT NULL DEFAULT now(),
  actualizado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX simulacion_lote_fecha_idx ON simulacion (lote_id, creado_en DESC);

CREATE TABLE resultado_simulacion (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulacion_id       uuid NOT NULL REFERENCES simulacion(id) ON DELETE CASCADE,
  destino_id          uuid NOT NULL REFERENCES destino(id),
  ruta_id             uuid NOT NULL REFERENCES ruta(id),
  distancia_km        numeric(6,1) NOT NULL,
  tiempo_horas        numeric(4,1) NOT NULL,
  merma_pct           numeric(4,1) NOT NULL,
  camiones            smallint NOT NULL CHECK (camiones >= 1),
  peso_vendido_kg     numeric(8,1) NOT NULL,
  precio_kg_cop       integer NOT NULL,
  comision_cop        integer NOT NULL DEFAULT 0,
  flete_cop           integer NOT NULL,
  peajes_cop          integer NOT NULL,
  costo_logistico_cop integer NOT NULL,
  ingreso_bruto_cop   integer NOT NULL,
  utilidad_neta_cop   integer NOT NULL,
  posicion            smallint NOT NULL CHECK (posicion >= 1),
  creado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (simulacion_id, destino_id)
);
CREATE UNIQUE INDEX resultado_sim_posicion_uq ON resultado_simulacion (simulacion_id, posicion);
CREATE INDEX resultado_destino_idx ON resultado_simulacion (destino_id);
CREATE INDEX resultado_ruta_idx    ON resultado_simulacion (ruta_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['productor','usuario','lote','destino','precio_mercado','ruta','simulacion','resultado_simulacion'] LOOP
    EXECUTE format('CREATE TRIGGER %I_actualizado BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION marcar_actualizado()', t, t);
  END LOOP;
END $$;
