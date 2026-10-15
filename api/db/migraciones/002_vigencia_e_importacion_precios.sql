-- 002 · Vigencia de precios e importación por lotes (fuente: Fedegán)

-- Cada carga masiva de precios queda registrada: quién la hizo, de dónde y qué cambió.
CREATE TABLE importacion_precio (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuente         varchar(160) NOT NULL,
  origen         varchar(20)  NOT NULL CHECK (origen IN ('manual', 'programada')),
  filas          integer NOT NULL CHECK (filas >= 0),
  insertados     integer NOT NULL CHECK (insertados >= 0),
  actualizados   integer NOT NULL CHECK (actualizados >= 0),
  sin_cambios    integer NOT NULL CHECK (sin_cambios >= 0),
  usuario_id     uuid REFERENCES usuario(id) ON DELETE SET NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX importacion_precio_creado_idx ON importacion_precio (creado_en DESC);
CREATE TRIGGER importacion_precio_actualizado BEFORE UPDATE ON importacion_precio
  FOR EACH ROW EXECUTE FUNCTION marcar_actualizado();

-- Dónde consultar el dato original (indicador de Fedegán, boletín, enlace) y de qué carga vino.
ALTER TABLE precio_mercado
  ADD COLUMN referencia     varchar(300),
  ADD COLUMN importacion_id uuid REFERENCES importacion_precio(id) ON DELETE SET NULL;

-- Cada resultado guarda la fecha del precio usado y su antigüedad al momento de simular.
ALTER TABLE resultado_simulacion
  ADD COLUMN precio_fecha            date,
  ADD COLUMN precio_antiguedad_dias  smallint CHECK (precio_antiguedad_dias >= 0),
  ADD COLUMN advertencia             varchar(300);
