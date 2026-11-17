-- ============================================================================
-- Pedido de envio sem caixas
--
-- Às vezes o pedido chega antes de a mercadoria ser embalada: quem pede marca
-- "Ainda não embalado" e manda o pedido sem caixas (boxes = []). A equipe
-- preenche as caixas ao criar o envio. Fora isso, a função é a mesma.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_form_submit(token TEXT, request JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    l      request_links;
    boxes  JSONB := request->'boxes';
    box    JSONB;
    clean  JSONB := '[]'::jsonb;
    w NUMERIC; h NUMERIC; d NUMERIC; kg NUMERIC;
    r_id   UUID;
    c_id   UUID;
    a_id   UUID;
    recent INTEGER;
    invoice NUMERIC;
    insured NUMERIC;
BEGIN
    l := request_form_auth(token);

    SELECT count(*) INTO recent FROM shipment_requests
     WHERE link_id = l.id AND created_at > now() - interval '1 hour';
    IF recent >= 30 THEN
        RAISE EXCEPTION 'too many requests, try again later' USING ERRCODE = '53400';
    END IF;

    c_id := (request->>'customer_id')::UUID;
    IF NOT EXISTS (SELECT 1 FROM customers WHERE id = c_id) THEN
        RAISE EXCEPTION 'customer not found' USING ERRCODE = '22023';
    END IF;

    -- Endereço: o escolhido (precisa ser do cliente) ou o padrão do cliente.
    a_id := NULLIF(request->>'address_id', '')::UUID;
    IF a_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customer_addresses WHERE id = a_id AND customer_id = c_id) THEN
        RAISE EXCEPTION 'address does not belong to the customer' USING ERRCODE = '22023';
    END IF;
    IF a_id IS NULL THEN
        SELECT id INTO a_id FROM customer_addresses WHERE customer_id = c_id ORDER BY is_default DESC, created_at LIMIT 1;
    END IF;
    IF a_id IS NULL THEN
        RAISE EXCEPTION 'customer has no shipping address' USING ERRCODE = '22023';
    END IF;

    IF request_form_clean(request->>'requested_by', 120) IS NULL THEN
        RAISE EXCEPTION 'requested_by is required' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(boxes) <> 'array' OR jsonb_array_length(boxes) NOT BETWEEN 0 AND 20 THEN
        RAISE EXCEPTION 'at most 20 boxes' USING ERRCODE = '22023';
    END IF;
    FOR box IN SELECT * FROM jsonb_array_elements(boxes) LOOP
        w := (box->>'width')::NUMERIC; h := (box->>'height')::NUMERIC;
        d := (box->>'depth')::NUMERIC; kg := (box->>'weight')::NUMERIC;
        IF w IS NULL OR h IS NULL OR d IS NULL OR kg IS NULL
           OR w NOT BETWEEN 1 AND 400 OR h NOT BETWEEN 1 AND 400 OR d NOT BETWEEN 1 AND 400
           OR kg NOT BETWEEN 0.1 AND 2000 THEN
            RAISE EXCEPTION 'invalid box size or weight' USING ERRCODE = '22023';
        END IF;
        clean := clean || jsonb_build_object('width', w, 'height', h, 'depth', d, 'weight', kg);
    END LOOP;

    -- Valor faturado: obrigatório. Seguro: 0 (ou vazio) = sem seguro.
    invoice := round(NULLIF(request->>'invoice_value', '')::NUMERIC, 2);
    insured := COALESCE(round(NULLIF(request->>'insured_value', '')::NUMERIC, 2), 0);
    -- Telas antigas (em cache) não mandam o campo: aceita sem valor; o formulário novo exige.
    IF (request ? 'invoice_value' AND invoice IS NULL) OR invoice NOT BETWEEN 0 AND 10000000 OR insured NOT BETWEEN 0 AND 10000000 THEN
        RAISE EXCEPTION 'invalid invoice or insured value' USING ERRCODE = '22023';
    END IF;

    INSERT INTO shipment_requests (customer_id, address_id, boxes, service_level, order_ref, notes, requested_by, link_id,
                                   invoice_value, insured_value)
    VALUES (
        c_id, a_id, clean,
        CASE WHEN request->>'service_level' = 'express' THEN 'express' ELSE 'standard' END,
        request_form_clean(request->>'order_ref', 80),
        request_form_clean(request->>'notes', 2000),
        request_form_clean(request->>'requested_by', 120),
        l.id,
        invoice, insured)
    RETURNING id INTO r_id;
    RETURN jsonb_build_object('id', r_id);
EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'invalid data' USING ERRCODE = '22023';
END;
$$;
