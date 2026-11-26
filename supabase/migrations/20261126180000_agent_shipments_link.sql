-- ============================================================================
-- Envios do agente no link pessoal (2026-11-26)
--
-- A aba Elenco do link pessoal já trazia os envios cadastrados à mão com
-- agente, mas só achava "os meus" pelo nome escrito. Agora cada item diz se é
-- da pessoa do link (mine), pelo employee_id do envio ou do pedido (ligado a
-- Persone pelo nome do agente). Também vem a data do envio (shipped_at), e os
-- envios da própria pessoa ficam na lista por 180 dias (os da equipe, 60).
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_form_list(token TEXT)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    l request_links;
BEGIN
    l := request_form_auth(token);
    RETURN COALESCE((
        SELECT jsonb_agg(x.item ORDER BY x.created_at DESC)
        FROM (
            SELECT r.created_at, jsonb_build_object(
                'id', r.id,
                'source', 'request',
                'created_at', r.created_at,
                'customer', c.name,
                'country', COALESCE(a.country, c.country),
                'city', COALESCE(a.city, c.city),
                'boxes', r.boxes,
                'service_level', r.service_level,
                'order_ref', r.order_ref,
                'invoice_value', r.invoice_value,
                'insured_value', r.insured_value,
                'requested_by', r.requested_by,
                'status', r.status,
                'is_pickup', COALESCE(s.is_pickup, false),
                'carrier', NULLIF(trim(concat_ws(' / ', s.selected_quote->>'portal', s.selected_quote->>'carrier')), ''),
                'tracking_code', NULLIF(s.tracking_code, ''),
                'shipped_at', s.created_at,
                'mine', COALESCE(l.employee_id IN (r.employee_id, s.employee_id), false)
            ) AS item
            FROM shipment_requests r
            JOIN customers c ON c.id = r.customer_id
            LEFT JOIN customer_addresses a ON a.id = r.address_id
            LEFT JOIN shipments s ON s.id = r.shipment_id
            WHERE r.created_at > now() - interval '60 days'  -- todos os links (o antigo /pedido e o /spedizione são da mesma equipe)
               OR (l.employee_id IS NOT NULL AND l.employee_id IN (r.employee_id, s.employee_id) AND r.created_at > now() - interval '180 days')

            UNION ALL

            SELECT s.created_at, jsonb_build_object(
                'id', s.id,
                'source', 'manual',
                'created_at', s.created_at,
                'customer', COALESCE(NULLIF(s.customer_name, ''), '—'),
                'country', s.destination_country,
                'city', NULL,
                'boxes', CASE WHEN jsonb_typeof(s.parcels) = 'array' THEN s.parcels ELSE '[]'::jsonb END,
                'service_level', COALESCE(s.service_level, 'standard'),
                'order_ref', NULLIF(s.order_id, ''),
                'invoice_value', NULL,
                'insured_value', NULL,
                'requested_by', COALESCE((SELECT employee_display_name(e) FROM employees e WHERE e.id = s.employee_id), trim(s.agent)),
                'status', 'shipped',
                'is_pickup', COALESCE(s.is_pickup, false),
                'carrier', NULLIF(trim(concat_ws(' / ', s.selected_quote->>'portal', s.selected_quote->>'carrier')), ''),
                'tracking_code', NULLIF(s.tracking_code, ''),
                'shipped_at', s.created_at,
                'mine', COALESCE(s.employee_id = l.employee_id, false)
            )
            FROM shipments s
            WHERE (NULLIF(trim(s.agent), '') IS NOT NULL OR s.employee_id IS NOT NULL)
              AND (s.created_at > now() - interval '60 days'
                   OR (l.employee_id IS NOT NULL AND s.employee_id = l.employee_id AND s.created_at > now() - interval '180 days'))
              AND s.request_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM shipment_requests r2 WHERE r2.shipment_id = s.id)
        ) x
    ), '[]'::jsonb);
END;
$function$;
