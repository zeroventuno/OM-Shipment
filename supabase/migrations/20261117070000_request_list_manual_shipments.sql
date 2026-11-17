-- Lista do formulário de pedidos (aba "Elenco"): além dos pedidos feitos pelo
-- link, entram os envios cadastrados à mão na tela interna que têm agente.
-- Assim a Érica vê também o envio que ela pediu pelo WhatsApp, com o tracking.
-- O campo requested_by recebe o agente; o formulário filtra pelo nome de quem
-- está usando. Entram os pedidos de todos os links da equipe, não só do link aberto.

CREATE OR REPLACE FUNCTION public.request_form_list(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
                'tracking_code', NULLIF(s.tracking_code, '')
            ) AS item
            FROM shipment_requests r
            JOIN customers c ON c.id = r.customer_id
            LEFT JOIN customer_addresses a ON a.id = r.address_id
            LEFT JOIN shipments s ON s.id = r.shipment_id
            WHERE r.created_at > now() - interval '60 days'  -- todos os links (o antigo /pedido e o /spedizione são da mesma equipe)

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
                'requested_by', trim(s.agent),
                'status', 'shipped',
                'is_pickup', COALESCE(s.is_pickup, false),
                'carrier', NULLIF(trim(concat_ws(' / ', s.selected_quote->>'portal', s.selected_quote->>'carrier')), ''),
                'tracking_code', NULLIF(s.tracking_code, '')
            )
            FROM shipments s
            WHERE NULLIF(trim(s.agent), '') IS NOT NULL
              AND s.created_at > now() - interval '60 days'
              AND s.request_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM shipment_requests r2 WHERE r2.shipment_id = s.id)
        ) x
    ), '[]'::jsonb);
END;
$$;
