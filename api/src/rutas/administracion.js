// Resumen del sistema y bitácora (solo administradores).
import { HOY_COLOMBIA } from '../bd.js';
import { paginar } from '../consultas.js';

export default ({ pool, config }) => {
  const vigencia = config.vigenciaPrecios ?? { advertencia: 7, maximo: 30 };
  return {
    async obtenerResumen() {
      const { rows: [r] } = await pool.query(
        `SELECT
           (SELECT count(*) FROM usuario) AS u_total,
           (SELECT count(*) FROM usuario WHERE activo) AS u_activos,
           (SELECT count(*) FROM usuario WHERE NOT activo) AS u_suspendidos,
           (SELECT count(*) FROM usuario WHERE rol = 'administrador' AND activo) AS u_admins,
           (SELECT count(*) FROM usuario WHERE debe_cambiar_contrasena) AS u_temporal,
           (SELECT count(*) FROM solicitud_contrasena WHERE estado = 'pendiente') AS u_solicitudes,
           (SELECT count(*) FROM productor) AS p_total,
           (SELECT count(*) FROM productor WHERE tipo_persona = 'natural') AS p_personas,
           (SELECT count(*) FROM productor WHERE tipo_persona = 'juridica') AS p_empresas,
           (SELECT count(*) FROM productor WHERE documento_verificado) AS p_verificados,
           (SELECT count(*) FROM productor WHERE numero_documento IS NULL) AS p_sin_doc,
           (SELECT count(*) FROM finca) AS fincas,
           (SELECT count(*) FROM lote) AS l_total,
           (SELECT count(*) FROM lote WHERE estado = 'disponible') AS l_disp,
           (SELECT count(*) FROM lote WHERE estado = 'simulado') AS l_sim,
           (SELECT count(*) FROM lote WHERE estado = 'vendido') AS l_vend,
           (SELECT count(*) FROM simulacion) AS s_total,
           (SELECT count(*) FROM simulacion WHERE creado_en >= now() - interval '7 days') AS s_7,
           (SELECT count(*) FROM destino WHERE activo) AS d_act,
           (SELECT count(*) FROM destino WHERE NOT activo) AS d_inact,
           (SELECT to_char(max(fecha), 'YYYY-MM-DD') FROM precio_mercado) AS pr_ultima`);
      const { rows: [pr] } = await pool.query(
        `WITH ultimo AS (
           SELECT p.destino_id, p.categoria, max(p.fecha) AS fecha
           FROM precio_mercado p JOIN destino d ON d.id = p.destino_id AND d.activo
           GROUP BY p.destino_id, p.categoria)
         SELECT count(*) FILTER (WHERE ${HOY_COLOMBIA} - fecha > $1 AND ${HOY_COLOMBIA} - fecha <= $2) AS advertencia,
                count(*) FILTER (WHERE ${HOY_COLOMBIA} - fecha > $2) AS vencidos
         FROM ultimo`, [vigencia.advertencia, vigencia.maximo]);
      const { rows: top } = await pool.query(
        `SELECT d.id AS destino_id, d.nombre, count(*) AS veces
         FROM simulacion s JOIN destino d ON d.id = s.mejor_destino_id
         GROUP BY d.id, d.nombre ORDER BY veces DESC, d.nombre LIMIT 5`);
      return {
        usuarios: { total: r.u_total, activos: r.u_activos, suspendidos: r.u_suspendidos, administradores: r.u_admins, deben_cambiar_contrasena: r.u_temporal, solicitudes_pendientes: r.u_solicitudes },
        productores: { total: r.p_total, personas: r.p_personas, empresas: r.p_empresas, verificados: r.p_verificados, sin_documento: r.p_sin_doc },
        fincas: r.fincas,
        lotes: { total: r.l_total, disponibles: r.l_disp, simulados: r.l_sim, vendidos: r.l_vend },
        simulaciones: { total: r.s_total, ultimos_7_dias: r.s_7 },
        destinos: { activos: r.d_act, inactivos: r.d_inact },
        precios: { ultima_fecha: r.pr_ultima, con_advertencia: pr.advertencia, vencidos: pr.vencidos },
        destinos_mas_elegidos: top,
      };
    },

    async listarBitacora(peticion) {
      const q = peticion.query;
      const { pagina, porPagina, limite, desplazamiento } = paginar(q);
      const { rows } = await pool.query(
        `SELECT id, usuario_id, usuario_nombre, accion, recurso, recurso_id, detalle, creado_en, count(*) OVER () AS total
         FROM bitacora WHERE ($1::text IS NULL OR recurso = $1)
         ORDER BY creado_en DESC, id DESC LIMIT $2 OFFSET $3`,
        [q.recurso ?? null, limite, desplazamiento]);
      const total = rows[0]?.total ?? 0;
      rows.forEach((f) => delete f.total);
      return { datos: rows, pagina, por_pagina: porPagina, total };
    },
  };
};
