-- ============================================================================
-- API de parceiros (v1)
--
-- Permite que outros sistemas da Officine Mattio (ex.: o sistema de ordens de
-- venda) leiam garantias, assistências e envios, e registrem notas e dados
-- administrativos, sem login de usuário.
--
-- Como funciona:
--   * Cada sistema parceiro recebe uma chave secreta (gerada por
--     scripts/create-partner-key.mjs). Aqui só fica o hash SHA-256 dela.
--   * As funções partner_* abaixo são chamadas pela API REST do Supabase:
--       POST {SUPABASE_URL}/rest/v1/rpc/<função>
--       headers: apikey: <anon key>, x-partner-key: <chave secreta>
--   * Cada função confere a chave e a permissão (scope) antes de tudo.
--     Sem chave válida: erro 28000 (HTTP 401/403).
--   * As funções são SECURITY DEFINER: leem as tabelas mesmo com o RLS
--     fechado para o papel anônimo, mas só devolvem os campos listados aqui.
--
-- Documentação para quem integra: docs/integracao-parceiros.md
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. Chaves
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.partner_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,
    scopes       TEXT[] NOT NULL DEFAULT ARRAY['read'],
    active       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ
);

COMMENT ON TABLE public.partner_keys IS 'Chaves da API de parceiros. Só o hash SHA-256 é guardado. Scopes: read, write.';

-- Ninguém acessa esta tabela pela API REST; só as funções abaixo.
ALTER TABLE public.partner_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_keys FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Autenticação
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.partner_auth(required_scope TEXT)
RETURNS public.partner_keys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    raw_key TEXT;
    k       public.partner_keys;
BEGIN
    raw_key := current_setting('request.headers', true)::json->>'x-partner-key';
    IF raw_key IS NULL OR raw_key = '' THEN
        RAISE EXCEPTION 'missing x-partner-key header' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO k FROM public.partner_keys
     WHERE key_hash = encode(extensions.digest(raw_key, 'sha256'), 'hex') AND active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid partner key' USING ERRCODE = '28000';
    END IF;
    IF NOT (required_scope = ANY (k.scopes)) THEN
        RAISE EXCEPTION 'partner key lacks scope %', required_scope USING ERRCODE = '42501';
    END IF;

    UPDATE public.partner_keys SET last_used_at = now() WHERE id = k.id;
    RETURN k;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Formato dos objetos devolvidos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.partner_shipment_json(s public.shipments)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', s.id,
        'order_id', s.order_id,
        'order_type', s.order_type,
        'customer_name', s.customer_name,
        'destination_country', s.destination_country,
        'quantity', s.quantity,
        'status', s.status,
        'service_level', s.service_level,
        'agent', s.agent,
        'portal', s.selected_quote->>'portal',
        'carrier', s.selected_quote->>'carrier',
        'cost', NULLIF(s.selected_quote->>'price', '')::NUMERIC,
        'tracking_code', NULLIF(s.tracking_code, ''),
        'customer_pickup', s.customer_cost_pickup,
        'warranty_protocol', (SELECT w.protocol_number FROM warranties w WHERE w.id = s.warranty_id),
        'ticket_id', s.ticket_id,
        'created_at', s.created_at,
        'updated_at', s.updated_at
    );
$$;

CREATE OR REPLACE FUNCTION public.partner_warranty_json(w public.warranties, with_history BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'protocol', w.protocol_number,
        'id', w.id,
        'status', w.status,
        'process_type', w.process_type,
        'start_date', w.start_date,
        'customer_name', w.customer_name,
        'agent', w.agent,
        'bike_model', w.bike_model,
        'size', w.size,
        'serial_number', w.serial_number,
        'new_serial_number', w.new_serial_number,
        'problem', w.problem,
        'solution', w.solution,
        'producer', w.producer,
        'order_number', w.order_number,
        'invoice', w.invoice,
        'value', w.value,
        'shipping', CASE WHEN w.shipment_id IS NULL THEN NULL ELSE jsonb_build_object(
            'date', w.shipping_date, 'carrier', w.shipping_company,
            'tracking_code', w.tracking_number, 'cost', w.shipping_cost, 'shipment_id', w.shipment_id) END,
        'created_at', w.created_at,
        'updated_at', w.updated_at
    ) || CASE WHEN with_history THEN jsonb_build_object('history', COALESCE(w.history, '[]'::jsonb)) ELSE '{}'::jsonb END;
$$;

CREATE OR REPLACE FUNCTION public.partner_ticket_json(t public.tickets, with_history BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', t.id,
        'phase', t.phase,
        'approval_status', t.approval_status,
        'customer_name', t.client_name,
        'component', t.component,
        'brand', t.brand,
        'serial_number', t.serial_number,
        'producer_protocol', t.protocol_number,
        'problem', t.problem,
        'shipping', CASE WHEN t.shipping_date IS NULL AND t.tracking_number IS NULL THEN NULL ELSE jsonb_build_object(
            'date', t.shipping_date, 'carrier', t.shipping_company,
            'tracking_code', t.tracking_number, 'cost', t.shipping_cost, 'shipment_id', t.shipment_id) END,
        'completion_date', t.completion_date,
        'created_at', t.created_at,
        'updated_at', t.updated_at
    ) || CASE WHEN with_history THEN jsonb_build_object('history', COALESCE(t.history, '[]'::jsonb)) ELSE '{}'::jsonb END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Leitura (scope "read")
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.partner_list_warranties(
    updated_since TIMESTAMPTZ DEFAULT NULL,
    status TEXT DEFAULT NULL,
    max_rows INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM partner_auth('read');
    RETURN COALESCE((
        SELECT jsonb_agg(partner_warranty_json(x.w) ORDER BY (x.w).updated_at)
        FROM (
            SELECT w FROM warranties w
            WHERE (updated_since IS NULL OR w.updated_at > updated_since)
              AND (partner_list_warranties.status IS NULL OR w.status = partner_list_warranties.status)
            ORDER BY w.updated_at
            LIMIT LEAST(GREATEST(max_rows, 1), 500)
        ) x
    ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_get_warranty(protocol TEXT DEFAULT NULL, order_number TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    w warranties;
BEGIN
    PERFORM partner_auth('read');
    IF protocol IS NULL AND order_number IS NULL THEN
        RAISE EXCEPTION 'pass protocol or order_number' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO w FROM warranties x
     WHERE (partner_get_warranty.protocol IS NULL OR x.protocol_number = partner_get_warranty.protocol)
       AND (partner_get_warranty.order_number IS NULL OR x.order_number = partner_get_warranty.order_number)
     ORDER BY x.created_at DESC LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'warranty not found' USING ERRCODE = 'P0002';
    END IF;
    RETURN partner_warranty_json(w, true) || jsonb_build_object(
        'shipments', COALESCE((SELECT jsonb_agg(partner_shipment_json(s) ORDER BY s.created_at)
                               FROM shipments s WHERE s.warranty_id = w.id), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_list_tickets(
    updated_since TIMESTAMPTZ DEFAULT NULL,
    max_rows INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM partner_auth('read');
    RETURN COALESCE((
        SELECT jsonb_agg(partner_ticket_json(x.t) ORDER BY (x.t).updated_at)
        FROM (
            SELECT t FROM tickets t
            WHERE updated_since IS NULL OR t.updated_at > updated_since
            ORDER BY t.updated_at
            LIMIT LEAST(GREATEST(max_rows, 1), 500)
        ) x
    ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_list_shipments(
    updated_since TIMESTAMPTZ DEFAULT NULL,
    order_id TEXT DEFAULT NULL,
    max_rows INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM partner_auth('read');
    RETURN COALESCE((
        SELECT jsonb_agg(partner_shipment_json(x.s) ORDER BY (x.s).updated_at)
        FROM (
            SELECT s FROM shipments s
            WHERE (updated_since IS NULL OR s.updated_at > updated_since)
              AND (partner_list_shipments.order_id IS NULL OR s.order_id = partner_list_shipments.order_id)
            ORDER BY s.updated_at
            LIMIT LEAST(GREATEST(max_rows, 1), 500)
        ) x
    ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Escrita (scope "write")
-- ---------------------------------------------------------------------------

-- Nota no histórico de uma garantia ou assistência (aparece na tela com o nome
-- do sistema parceiro).
CREATE OR REPLACE FUNCTION public.partner_add_note(
    kind TEXT,
    reference TEXT,
    note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    k     partner_keys;
    entry JSONB;
    n     INTEGER;
BEGIN
    k := partner_auth('write');
    IF note IS NULL OR length(trim(note)) = 0 OR length(note) > 2000 THEN
        RAISE EXCEPTION 'note must have 1 to 2000 characters' USING ERRCODE = '22023';
    END IF;
    entry := jsonb_build_object(
        'field', 'partnerNote', 'oldValue', '-', 'newValue', k.name || ': ' || trim(note),
        'date', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'action', 'updated');

    IF kind = 'warranty' THEN
        UPDATE warranties SET history = COALESCE(history, '[]'::jsonb) || entry
         WHERE protocol_number = reference OR id = reference;
    ELSIF kind = 'ticket' THEN
        UPDATE tickets SET history = COALESCE(history, '[]'::jsonb) || entry WHERE id = reference;
    ELSE
        RAISE EXCEPTION 'kind must be warranty or ticket' USING ERRCODE = '22023';
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN
        RAISE EXCEPTION '% not found', kind USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- Dados administrativos da garantia que vêm do sistema de vendas
-- (nº da ordem, fatura, valor). Só altera o que for enviado (não nulo).
CREATE OR REPLACE FUNCTION public.partner_update_warranty_admin(
    protocol TEXT,
    order_number TEXT DEFAULT NULL,
    invoice TEXT DEFAULT NULL,
    value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    k   partner_keys;
    w   warranties;
    now_txt TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    changes JSONB := '[]'::jsonb;
BEGIN
    k := partner_auth('write');
    SELECT * INTO w FROM warranties x WHERE x.protocol_number = partner_update_warranty_admin.protocol FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'warranty not found' USING ERRCODE = 'P0002';
    END IF;

    IF order_number IS NOT NULL AND order_number IS DISTINCT FROM w.order_number THEN
        changes := changes || jsonb_build_object('field', 'orderNumber', 'oldValue', COALESCE(w.order_number, '-'), 'newValue', order_number, 'date', now_txt, 'action', 'updated');
    END IF;
    IF invoice IS NOT NULL AND invoice IS DISTINCT FROM w.invoice THEN
        changes := changes || jsonb_build_object('field', 'invoice', 'oldValue', COALESCE(w.invoice, '-'), 'newValue', invoice, 'date', now_txt, 'action', 'updated');
    END IF;
    IF value IS NOT NULL AND value IS DISTINCT FROM w.value THEN
        changes := changes || jsonb_build_object('field', 'value', 'oldValue', COALESCE(w.value, '-'), 'newValue', value, 'date', now_txt, 'action', 'updated');
    END IF;

    IF jsonb_array_length(changes) > 0 THEN
        UPDATE warranties x SET
            order_number = COALESCE(partner_update_warranty_admin.order_number, x.order_number),
            invoice      = COALESCE(partner_update_warranty_admin.invoice, x.invoice),
            value        = COALESCE(partner_update_warranty_admin.value, x.value),
            history      = COALESCE(x.history, '[]'::jsonb) || changes
        WHERE x.id = w.id
        RETURNING * INTO w;
    END IF;
    RETURN partner_warranty_json(w);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permissões
-- ---------------------------------------------------------------------------
-- Por padrão o Postgres deixa qualquer papel executar funções. Fecha tudo e
-- abre só os pontos de entrada da API (que conferem a chave sozinhos).

REVOKE ALL ON FUNCTION public.partner_auth(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_shipment_json(public.shipments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_warranty_json(public.warranties, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_ticket_json(public.tickets, BOOLEAN) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.partner_list_warranties(TIMESTAMPTZ, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.partner_get_warranty(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.partner_list_tickets(TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.partner_list_shipments(TIMESTAMPTZ, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.partner_add_note(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.partner_update_warranty_admin(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.partner_list_warranties(TIMESTAMPTZ, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.partner_get_warranty(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.partner_list_tickets(TIMESTAMPTZ, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.partner_list_shipments(TIMESTAMPTZ, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.partner_add_note(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.partner_update_warranty_admin(TEXT, TEXT, TEXT, TEXT) TO anon;

-- As funções de gatilho também não precisam ser chamáveis pela API.
REVOKE ALL ON FUNCTION public.set_warranty_protocol() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_shipment_to_process() FROM PUBLIC, anon, authenticated;
