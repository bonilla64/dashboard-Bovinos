-- Entrega 3 (ajustes): tipos de cuenta, fincas, estado de las cuentas y bitácora de cambios.

-- ---------- Productor: persona natural o empresa, documento y ubicación ----------
CREATE TYPE tipo_persona   AS ENUM ('natural', 'juridica');
CREATE TYPE tipo_documento AS ENUM ('CC', 'CE', 'NIT');

ALTER TABLE productor
  ADD COLUMN tipo_persona         tipo_persona NOT NULL DEFAULT 'natural',
  ADD COLUMN tipo_documento       tipo_documento,
  ADD COLUMN numero_documento     varchar(15),
  ADD COLUMN representante_legal  varchar(120),
  ADD COLUMN departamento         varchar(60) NOT NULL DEFAULT 'Casanare',
  ADD COLUMN vereda               varchar(80),
  ADD COLUMN documento_verificado boolean NOT NULL DEFAULT false,
  ADD COLUMN acepta_datos_en      timestamptz,
  -- Tipo y número de documento van juntos (las fichas anteriores a este cambio pueden no tenerlos).
  ADD CONSTRAINT productor_documento_completo CHECK ((tipo_documento IS NULL) = (numero_documento IS NULL)),
  -- Una empresa se identifica con NIT; una persona, con cédula.
  ADD CONSTRAINT productor_documento_tipo CHECK (tipo_documento IS NULL OR (tipo_persona = 'juridica') = (tipo_documento = 'NIT')),
  -- Toda empresa tiene representante legal.
  ADD CONSTRAINT productor_representante CHECK (tipo_persona = 'natural' OR representante_legal IS NOT NULL);
CREATE UNIQUE INDEX productor_documento_uq ON productor (tipo_documento, numero_documento) WHERE numero_documento IS NOT NULL;

-- ---------- Usuario: suspender en vez de borrar, contraseña temporal ----------
ALTER TABLE usuario
  ADD COLUMN activo                  boolean NOT NULL DEFAULT true,
  ADD COLUMN debe_cambiar_contrasena boolean NOT NULL DEFAULT false,
  ADD COLUMN ultimo_ingreso          timestamptz;

-- ---------- Finca: un productor puede tener varias; cada lote sale de una ----------
CREATE TABLE finca (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  productor_id   uuid NOT NULL REFERENCES productor(id) ON DELETE CASCADE,
  nombre         varchar(80) NOT NULL CHECK (char_length(nombre) >= 3),
  departamento   varchar(60) NOT NULL DEFAULT 'Casanare',
  municipio      varchar(60) NOT NULL,
  vereda         varchar(80),
  ubicacion      geometry(Point, 4326),
  area_ha        numeric(8,1) CHECK (area_ha IS NULL OR (area_ha > 0 AND area_ha <= 100000)),
  activo         boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX finca_nombre_uq ON finca (productor_id, lower(nombre));
CREATE INDEX finca_productor_idx ON finca (productor_id);
CREATE INDEX finca_ubicacion_gix ON finca USING GIST (ubicacion);
CREATE TRIGGER finca_actualizado BEFORE UPDATE ON finca FOR EACH ROW EXECUTE FUNCTION marcar_actualizado();

ALTER TABLE lote ADD COLUMN finca_id uuid REFERENCES finca(id) ON DELETE RESTRICT;
CREATE INDEX lote_finca_idx ON lote (finca_id);

-- Los lotes que ya existían: una finca por cada nombre de finca que usó cada productor.
INSERT INTO finca (productor_id, nombre, municipio)
SELECT DISTINCT ON (productor_id, lower(finca)) productor_id, finca, municipio_origen
FROM lote
WHERE finca IS NOT NULL AND char_length(finca) >= 3
ORDER BY productor_id, lower(finca), creado_en;

UPDATE lote l SET finca_id = f.id
FROM finca f
WHERE f.productor_id = l.productor_id AND lower(f.nombre) = lower(l.finca);

-- ---------- Bitácora: quién cambió qué y cuándo ----------
CREATE TABLE bitacora (
  id             bigserial PRIMARY KEY,
  usuario_id     uuid REFERENCES usuario(id) ON DELETE SET NULL,
  usuario_nombre varchar(120),
  accion         varchar(40) NOT NULL,
  recurso        varchar(40) NOT NULL,
  recurso_id     varchar(64),
  detalle        jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bitacora_fecha_idx ON bitacora (creado_en DESC);
CREATE INDEX bitacora_recurso_idx ON bitacora (recurso, recurso_id);
