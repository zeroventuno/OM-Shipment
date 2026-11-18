-- Unir clientes: as faturas de importação (import_documents) passam para o
-- cadastro principal. Antes o vínculo ficava vazio ao apagar o cadastro unido.
-- merge_customers roda com a permissão de quem usa o sistema, por isso a equipe
-- precisa poder alterar essa coluna.

GRANT UPDATE (customer_id) ON public.import_documents TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_customers(main_id UUID, other_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    main      customers%ROWTYPE;
    o         customers%ROWTYPE;
    others    UUID[];
    n_addr    INT;
    n_req     INT;
    n_dup     INT;
BEGIN
    others := ARRAY(SELECT DISTINCT x FROM unnest(other_ids) x WHERE x IS NOT NULL AND x <> main_id);
    IF array_length(others, 1) IS NULL THEN
        RAISE EXCEPTION 'Nenhum cadastro para unir';
    END IF;
    SELECT * INTO main FROM customers WHERE id = main_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cliente principal não encontrado'; END IF;
    IF (SELECT count(*) FROM customers WHERE id = ANY (others)) <> array_length(others, 1) THEN
        RAISE EXCEPTION 'Algum cadastro para unir não existe mais';
    END IF;

    FOR o IN SELECT c.* FROM unnest(others) WITH ORDINALITY u(id, pos) JOIN customers c ON c.id = u.id ORDER BY u.pos LOOP
        IF NULLIF(trim(main.address_line1), '') IS NULL AND NULLIF(trim(o.address_line1), '') IS NOT NULL THEN
            main.address_line1 := o.address_line1; main.address_line2 := o.address_line2; main.address_line3 := o.address_line3;
            main.postal_code := o.postal_code; main.city := o.city; main.region := o.region;
            main.country := COALESCE(NULLIF(main.country, ''), o.country);
        END IF;
        main.country      := COALESCE(NULLIF(trim(main.country), ''), o.country);
        main.contact_name := COALESCE(NULLIF(trim(main.contact_name), ''), o.contact_name);
        main.phone        := COALESCE(NULLIF(trim(main.phone), ''), o.phone);
        main.email        := COALESCE(NULLIF(trim(main.email), ''), o.email);
        main.tax_id       := COALESCE(NULLIF(trim(main.tax_id), ''), o.tax_id);
        IF NULLIF(trim(o.notes), '') IS NOT NULL AND position(trim(o.notes) IN COALESCE(main.notes, '')) = 0 THEN
            main.notes := concat_ws(E'\n', NULLIF(trim(main.notes), ''), trim(o.notes));
        END IF;
    END LOOP;

    UPDATE customers SET
        address_line1 = main.address_line1, address_line2 = main.address_line2, address_line3 = main.address_line3,
        postal_code = main.postal_code, city = main.city, region = main.region, country = main.country,
        contact_name = main.contact_name, phone = main.phone, email = main.email, tax_id = main.tax_id, notes = main.notes
    WHERE id = main_id;

    -- Apelidos: nomes dos outros e os apelidos que eles já tinham.
    INSERT INTO customer_aliases (customer_id, name)
    SELECT DISTINCT ON (name_key(n)) main_id, n FROM (
        SELECT name AS n FROM customers WHERE id = ANY (others)
        UNION ALL
        SELECT name FROM customer_aliases WHERE customer_id = ANY (others)
    ) z
    WHERE name_key(n) <> name_key(main.name)
    ON CONFLICT DO NOTHING;

    -- Endereços de entrega
    UPDATE customer_addresses SET customer_id = main_id, is_default = false WHERE customer_id = ANY (others);
    GET DIAGNOSTICS n_addr = ROW_COUNT;
    WITH ranked AS (
        SELECT id, row_number() OVER (
            PARTITION BY name_key(address_line1), name_key(postal_code), name_key(city), name_key(country)
            ORDER BY is_default DESC, created_at
        ) AS rn
        FROM customer_addresses WHERE customer_id = main_id
    )
    DELETE FROM customer_addresses WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
    GET DIAGNOSTICS n_dup = ROW_COUNT;
    IF NOT EXISTS (SELECT 1 FROM customer_addresses WHERE customer_id = main_id AND is_default) THEN
        UPDATE customer_addresses SET is_default = true
        WHERE id = (SELECT id FROM customer_addresses WHERE customer_id = main_id ORDER BY created_at LIMIT 1);
    END IF;

    -- Pedidos de envio
    UPDATE shipment_requests SET customer_id = main_id WHERE customer_id = ANY (others);
    GET DIAGNOSTICS n_req = ROW_COUNT;

    -- Faturas de importação continuam ligadas ao cliente que ficou.
    UPDATE import_documents SET customer_id = main_id WHERE customer_id = ANY (others);

    DELETE FROM customers WHERE id = ANY (others);

    RETURN jsonb_build_object('merged', array_length(others, 1), 'addresses_moved', n_addr - n_dup,
                              'addresses_duplicate', n_dup, 'requests', n_req);
END;
$$;
