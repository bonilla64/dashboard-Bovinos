-- Entrega 3 (ajustes): recuperación de contraseña por solicitud al administrador.
-- La persona que olvidó su contraseña la pide desde «Ingresar» con su correo y su documento;
-- un administrador la atiende generando una contraseña temporal (que deberá cambiar al ingresar).

CREATE TYPE estado_solicitud AS ENUM ('pendiente', 'atendida', 'descartada');

CREATE TABLE solicitud_contrasena (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  estado          estado_solicitud NOT NULL DEFAULT 'pendiente',
  atendida_por    uuid REFERENCES usuario(id) ON DELETE SET NULL,
  atendida_en     timestamptz,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  CHECK ((estado = 'pendiente') = (atendida_en IS NULL))
);

-- Una sola solicitud pendiente por cuenta: si la persona insiste, no se llenan de repetidas.
CREATE UNIQUE INDEX solicitud_pendiente_uq ON solicitud_contrasena (usuario_id) WHERE estado = 'pendiente';
CREATE INDEX solicitud_estado_fecha_idx ON solicitud_contrasena (estado, creado_en DESC);
CREATE TRIGGER solicitud_contrasena_actualizado BEFORE UPDATE ON solicitud_contrasena
  FOR EACH ROW EXECUTE FUNCTION marcar_actualizado();
