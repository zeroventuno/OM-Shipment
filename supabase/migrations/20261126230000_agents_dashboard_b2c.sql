-- ============================================================================
-- Painel Agenti: só os agentes comerciais e, no fim, o B2C (2026-11-26)
--
-- A pedido do Cristiano: o painel mostra só quem é do setor Commerciali, e
-- uma linha "B2C" com os envios do e-commerce (shipments.channel = 'B2C') do
-- ano, no mesmo formato dos agentes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.b2c_stats(y INT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH s AS (
        SELECT shipment_kind(order_type) AS kind, COALESCE(profit, 0) AS profit
          FROM shipments WHERE channel = 'B2C' AND extract(year FROM created_at AT TIME ZONE 'Europe/Rome') = y
    )
    SELECT jsonb_build_object(
        'shipments', jsonb_build_object(
            'n', (SELECT count(*) FROM s),
            'profit', (SELECT round(COALESCE(sum(profit), 0), 2) FROM s),
            'by_type', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', kind, 'n', n, 'profit', p) ORDER BY n DESC)
                                   FROM (SELECT kind, count(*) n, round(sum(profit), 2) p FROM s GROUP BY kind) x), '[]'::jsonb)),
        'warranties', jsonb_build_object('total', 0, 'year', 0, 'open', 0, 'by_status', '{}'::jsonb),
        'tickets', jsonb_build_object('total', 0, 'year', 0, 'open', 0, 'by_phase', '{}'::jsonb)
    );
$$;

CREATE OR REPLACE FUNCTION public.agents_dashboard_data(y INT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'year', y,
        'om', om_stats(y),
        'agents', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', e.id, 'name', employee_display_name(e), 'sector', e.primary_sector, 'active', e.active,
                'stats', agent_stats_for(e.id, y)) ORDER BY employee_display_name(e))
              FROM employees e
             WHERE 'commerciali' IN (e.primary_sector, COALESCE(e.secondary_sector, ''))
        ), '[]'::jsonb),
        'b2c', b2c_stats(y)
    );
$$;

REVOKE ALL ON FUNCTION public.b2c_stats(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agents_dashboard_data(INT) FROM PUBLIC, anon, authenticated;
