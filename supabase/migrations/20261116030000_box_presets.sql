-- ============================================================================
-- Caixas padrão e cadastro de cliente pelo formulário aberto
--
-- 1. box_presets: as caixas mais usadas pela Officine Mattio (nome, medidas e
--    peso médio). No pedido de envio, quem pede escolhe uma delas ou digita
--    medidas novas. A lista é preenchida pela Officine Mattio.
-- 2. request_form_box_presets: lista as caixas ativas para o formulário.
-- 3. request_form_create_customer passa a dizer se o cliente já existia
--    (usado na aba "Cadastrar cliente" do formulário).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.box_presets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    width      NUMERIC NOT NULL CHECK (width > 0),
    height     NUMERIC NOT NULL CHECK (height > 0),
    depth      NUMERIC NOT NULL CHECK (depth > 0),
    -- Peso médio da caixa já com o conteúdo de costume (kg)
    avg_weight NUMERIC CHECK (avg_weight IS NULL OR avg_weight > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    active     BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.box_presets IS 'Caixas padrão da Officine Mattio (medidas em cm, peso médio em kg).';

ALTER TABLE public.box_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "box_presets_authenticated_full_access" ON public.box_presets;
CREATE POLICY "box_presets_authenticated_full_access" ON public.box_presets
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.box_presets FROM anon;

CREATE OR REPLACE FUNCTION public.request_form_box_presets(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM request_form_auth(token);
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', b.id, 'name', b.name, 'width', b.width, 'height', b.height,
            'depth', b.depth, 'avg_weight', b.avg_weight) ORDER BY b.sort_order, b.name)
        FROM box_presets b WHERE b.active
    ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.request_form_box_presets(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_form_box_presets(TEXT) TO anon, authenticated;

-- Mesma função de antes, agora devolvendo também "existed".
CREATE OR REPLACE FUNCTION public.request_form_create_customer(token TEXT, customer JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c_name  TEXT := request_form_clean(customer->>'name', 200);
    c_id    UUID;
    existed BOOLEAN := false;
BEGIN
    PERFORM request_form_auth(token);
    IF c_name IS NULL THEN
        RAISE EXCEPTION 'customer name is required' USING ERRCODE = '22023';
    END IF;
    IF request_form_clean(customer->>'address_line1', 300) IS NULL
       OR request_form_clean(customer->>'city', 120) IS NULL
       OR request_form_clean(customer->>'country', 80) IS NULL THEN
        RAISE EXCEPTION 'address, city and country are required' USING ERRCODE = '22023';
    END IF;

    SELECT id INTO c_id FROM customers WHERE lower(trim(name)) = lower(c_name);
    IF c_id IS NOT NULL THEN
        existed := true;
        -- Cliente que só tinha o nome (vindo dos envios antigos) ganha o endereço.
        UPDATE customers SET
            address_line1 = request_form_clean(customer->>'address_line1', 300),
            address_line2 = request_form_clean(customer->>'address_line2', 300),
            address_line3 = request_form_clean(customer->>'address_line3', 300),
            postal_code   = request_form_clean(customer->>'postal_code', 20),
            city          = request_form_clean(customer->>'city', 120),
            region        = request_form_clean(customer->>'region', 120),
            country       = request_form_clean(customer->>'country', 80),
            contact_name  = COALESCE(request_form_clean(customer->>'contact_name', 200), contact_name),
            phone         = COALESCE(request_form_clean(customer->>'phone', 60), phone),
            email         = COALESCE(request_form_clean(customer->>'email', 200), email),
            tax_id        = COALESCE(request_form_clean(customer->>'tax_id', 60), tax_id)
        WHERE id = c_id AND address_line1 IS NULL;
    ELSE
        INSERT INTO customers (name, address_line1, address_line2, address_line3, postal_code, city, region, country,
                               contact_name, phone, email, tax_id, source)
        VALUES (
            c_name,
            request_form_clean(customer->>'address_line1', 300),
            request_form_clean(customer->>'address_line2', 300),
            request_form_clean(customer->>'address_line3', 300),
            request_form_clean(customer->>'postal_code', 20),
            request_form_clean(customer->>'city', 120),
            request_form_clean(customer->>'region', 120),
            request_form_clean(customer->>'country', 80),
            request_form_clean(customer->>'contact_name', 200),
            request_form_clean(customer->>'phone', 60),
            request_form_clean(customer->>'email', 200),
            request_form_clean(customer->>'tax_id', 60),
            'request_form')
        RETURNING id INTO c_id;
    END IF;
    RETURN jsonb_build_object('id', c_id, 'name', c_name, 'existed', existed);
END;
$$;
