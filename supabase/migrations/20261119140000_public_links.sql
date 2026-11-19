-- ============================================================================
-- Links gerais para a equipe copiar
--
-- Os links dos formulários (pedido de envio, retirada, garantia/assistência)
-- ficam no banco só como hash: depois de criados, ninguém consegue vê-los de
-- novo. Aqui fica UM link geral por tipo, legível só por quem tem login, para
-- o botão «Link» do menu lateral copiar.
--
-- A equipe pode colar um link que já usa (é conferido contra o hash) ou gerar
-- um novo. Gerar um novo NÃO desativa os anteriores: quem já tem o antigo
-- continua conseguindo usar.
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.public_links (
    kind       TEXT PRIMARY KEY CHECK (kind IN ('request', 'pickup', 'service')),
    token      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.public_links IS 'Link geral de cada formulário, para a equipe copiar no menu. Só pelas funções staff_*.';
ALTER TABLE public.public_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_links FROM anon, authenticated;

-- Hash do token no mesmo formato das tabelas de links.
CREATE OR REPLACE FUNCTION public.public_link_hash(token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
    SELECT encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex');
$$;

-- O token ainda vale (existe e está ativo) na tabela do tipo?
CREATE OR REPLACE FUNCTION public.public_link_active(p_kind TEXT, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
    RETURN CASE p_kind
        WHEN 'request' THEN EXISTS (SELECT 1 FROM request_links WHERE token_hash = public_link_hash(p_token) AND active)
        WHEN 'pickup'  THEN EXISTS (SELECT 1 FROM pickup_links  WHERE token_hash = public_link_hash(p_token) AND active)
        WHEN 'service' THEN EXISTS (SELECT 1 FROM service_links WHERE token_hash = public_link_hash(p_token) AND active)
        ELSE false END;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_check()
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'login required' USING ERRCODE = '28000';
    END IF;
END;
$$;

-- { "request": "<token>" | null, "pickup": …, "service": … } — só links ainda ativos.
CREATE OR REPLACE FUNCTION public.staff_public_links()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSONB := jsonb_build_object('request', NULL, 'pickup', NULL, 'service', NULL);
    l      public_links;
BEGIN
    PERFORM staff_check();
    FOR l IN SELECT * FROM public_links LOOP
        IF public_link_active(l.kind, l.token) THEN
            result := result || jsonb_build_object(l.kind, l.token);
        END IF;
    END LOOP;
    RETURN result;
END;
$$;

-- Guarda um link que a equipe já usa (aceita o endereço inteiro ou só o token).
CREATE OR REPLACE FUNCTION public.staff_save_public_link(p_kind TEXT, p_link TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    tok TEXT := (regexp_match(trim(coalesce(p_link, '')), '([A-Za-z0-9]{8,64})/?(\?.*)?$'))[1];
BEGIN
    PERFORM staff_check();
    IF tok IS NULL OR NOT public_link_active(p_kind, tok) THEN
        RAISE EXCEPTION 'link not valid for this form' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public_links (kind, token) VALUES (p_kind, tok)
        ON CONFLICT (kind) DO UPDATE SET token = EXCLUDED.token, updated_at = now();
    RETURN jsonb_build_object('token', tok);
END;
$$;

-- Cria um link novo do tipo e passa a mostrá-lo no menu. Os antigos continuam ativos.
CREATE OR REPLACE FUNCTION public.staff_new_public_link(p_kind TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    alphabet CONSTANT TEXT := 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    tok   TEXT := '';
    b     INTEGER;
    lname TEXT := 'Link generale · ' || to_char(now() AT TIME ZONE 'Europe/Rome', 'DD/MM/YYYY');
BEGIN
    PERFORM staff_check();
    -- 16 caracteres sem os que se confundem (0/O, 1/l/I); descarta bytes que dariam viés.
    WHILE length(tok) < 16 LOOP
        b := get_byte(extensions.gen_random_bytes(1), 0);
        IF b < 224 THEN
            tok := tok || substr(alphabet, (b % 56) + 1, 1);
        END IF;
    END LOOP;
    IF p_kind = 'request' THEN
        INSERT INTO request_links (name, token_hash) VALUES (lname, public_link_hash(tok));
    ELSIF p_kind = 'pickup' THEN
        INSERT INTO pickup_links (name, token_hash) VALUES (lname, public_link_hash(tok));
    ELSIF p_kind = 'service' THEN
        INSERT INTO service_links (name, token_hash) VALUES (lname, public_link_hash(tok));
    ELSE
        RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public_links (kind, token) VALUES (p_kind, tok)
        ON CONFLICT (kind) DO UPDATE SET token = EXCLUDED.token, updated_at = now();
    RETURN jsonb_build_object('token', tok);
END;
$$;

REVOKE ALL ON FUNCTION public.public_link_hash(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_link_active(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_check() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_public_links() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_save_public_link(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_new_public_link(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_public_links() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_save_public_link(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_new_public_link(TEXT) TO authenticated;
