-- ============================================================================
-- Piloto NFC: chips nas peças Officine Mattio
--
-- Cada chip guarda só um link /t/<code>. O que a página mostra depende do
-- estado do chip:
--   blank    = código gerado, chip ainda não gravado;
--   written  = chip gravado, sem dono;
--   active   = com dono (atleta): mostra o cartão de emergência;
--   disabled = bloqueado (peça perdida ou roubada).
--
-- O atleta NÃO usa o login do gestionale (quem tem login vê todo o sistema).
-- Ele recebe um link pessoal e secreto (access token, guardado só como hash)
-- para editar o próprio cartão. A equipe pode gerar um link novo, e o antigo
-- deixa de valer.
--
-- As tabelas ficam fechadas: tudo passa pelas funções abaixo. Os dados de saúde
-- só saem pela página pública, e só os campos que o atleta marcou como visíveis.
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.nfc_owners (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT,
    email              TEXT,
    phone              TEXT,
    blood_type         TEXT CHECK (blood_type IS NULL OR blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-')),
    allergies          TEXT,
    conditions         TEXT,
    medications        TEXT,
    -- [{ "name": "...", "relation": "...", "phone": "..." }], no máximo 3
    emergency_contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes              TEXT,
    -- { "name": true, "phone": false, ... }
    visibility         JSONB NOT NULL DEFAULT '{}'::jsonb,
    language           TEXT,
    consent_at         TIMESTAMPTZ NOT NULL,
    access_hash        TEXT NOT NULL UNIQUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.nfc_owners IS 'Atletas donos de chips NFC. Dados de saúde: só pelas funções nfc_*.';
ALTER TABLE public.nfc_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nfc_owners FROM anon, authenticated;

DROP TRIGGER IF EXISTS nfc_owners_touch ON public.nfc_owners;
CREATE TRIGGER nfc_owners_touch BEFORE UPDATE ON public.nfc_owners
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.nfc_tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9]{8}$'),
    chip_uid    TEXT,
    status      TEXT NOT NULL DEFAULT 'blank' CHECK (status IN ('blank', 'written', 'active', 'disabled')),
    kind        TEXT NOT NULL DEFAULT 'athlete' CHECK (kind IN ('athlete', 'product', 'internal')),
    product_ref TEXT,
    owner_id    UUID REFERENCES public.nfc_owners(id) ON DELETE SET NULL,
    locked      BOOLEAN NOT NULL DEFAULT false,
    written_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nfc_tags_owner_idx ON public.nfc_tags (owner_id);
ALTER TABLE public.nfc_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nfc_tags FROM anon, authenticated;

-- Só para contar uso: sem IP e sem localização.
CREATE TABLE IF NOT EXISTS public.nfc_scans (
    tag_id UUID NOT NULL REFERENCES public.nfc_tags(id) ON DELETE CASCADE,
    at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nfc_scans_tag_idx ON public.nfc_scans (tag_id, at DESC);
ALTER TABLE public.nfc_scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nfc_scans FROM anon, authenticated;

-- Tentativas com código que não existe, para barrar quem tenta adivinhar.
-- Guarda só o hash do IP, e só por um dia.
CREATE TABLE IF NOT EXISTS public.nfc_misses (
    ip_hash TEXT NOT NULL,
    at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nfc_misses_ip_idx ON public.nfc_misses (ip_hash, at DESC);
ALTER TABLE public.nfc_misses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nfc_misses FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Funções de apoio (não expostas)
-- ---------------------------------------------------------------------------

-- 8 caracteres base62 aleatórios (sem viés: descarta bytes >= 248).
CREATE OR REPLACE FUNCTION public.nfc_random_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
    alphabet CONSTANT TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    result TEXT := '';
    b INTEGER;
BEGIN
    WHILE length(result) < 8 LOOP
        b := get_byte(extensions.gen_random_bytes(1), 0);
        IF b < 248 THEN
            result := result || substr(alphabet, (b % 62) + 1, 1);
        END IF;
    END LOOP;
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.nfc_hash(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
    SELECT encode(extensions.digest(coalesce(value, ''), 'sha256'), 'hex');
$$;

-- Hash do IP de quem chama (primeiro valor do x-forwarded-for).
CREATE OR REPLACE FUNCTION public.nfc_caller()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    headers JSON;
BEGIN
    BEGIN
        headers := current_setting('request.headers', true)::json;
    EXCEPTION WHEN others THEN
        headers := NULL;
    END;
    RETURN nfc_hash('nfc:' || coalesce(trim(split_part(headers->>'x-forwarded-for', ',', 1)), 'none'));
END;
$$;

-- Barra quem errou código demais nos últimos 10 minutos.
CREATE OR REPLACE FUNCTION public.nfc_guard()
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (SELECT count(*) FROM nfc_misses WHERE ip_hash = nfc_caller() AND at > now() - interval '10 minutes') >= 30 THEN
        RAISE EXCEPTION 'too many attempts, try again later' USING ERRCODE = '53400';
    END IF;
END;
$$;

-- Chip pelo código; código inexistente conta como tentativa errada.
CREATE OR REPLACE FUNCTION public.nfc_find(p_code TEXT)
RETURNS public.nfc_tags
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    t nfc_tags;
BEGIN
    PERFORM nfc_guard();
    IF coalesce(p_code, '') ~ '^[A-Za-z0-9]{8}$' THEN
        SELECT * INTO t FROM nfc_tags WHERE code = p_code;
    END IF;
    IF t.id IS NULL THEN
        DELETE FROM nfc_misses WHERE at < now() - interval '1 day';
        INSERT INTO nfc_misses (ip_hash) VALUES (nfc_caller());
    END IF;
    RETURN t;
END;
$$;

CREATE OR REPLACE FUNCTION public.nfc_owner_by_token(token TEXT)
RETURNS public.nfc_owners
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    o nfc_owners;
BEGIN
    PERFORM nfc_guard();
    SELECT * INTO o FROM nfc_owners WHERE access_hash = nfc_hash(token) AND length(coalesce(token, '')) >= 32;
    IF o.id IS NULL THEN
        DELETE FROM nfc_misses WHERE at < now() - interval '1 day';
        INSERT INTO nfc_misses (ip_hash) VALUES (nfc_caller());
        RAISE EXCEPTION 'invalid or expired link' USING ERRCODE = '28000';
    END IF;
    RETURN o;
END;
$$;

CREATE OR REPLACE FUNCTION public.nfc_new_token()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
    SELECT encode(extensions.gen_random_bytes(24), 'hex');
$$;

-- Grava no dono os campos do perfil vindos do formulário (limpos e limitados).
CREATE OR REPLACE FUNCTION public.nfc_apply_profile(p_owner UUID, profile JSONB)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    fields   CONSTANT TEXT[] := ARRAY['name', 'phone', 'blood_type', 'allergies', 'conditions', 'medications', 'emergency_contacts', 'notes'];
    vis      JSONB := '{}'::jsonb;
    contacts JSONB := '[]'::jsonb;
    c        JSONB;
    f        TEXT;
    blood    TEXT := replace(upper(request_form_clean(profile->>'blood_type', 3)), 'O', '0');
    p_email  TEXT := lower(request_form_clean(profile->>'email', 200));
BEGIN
    IF blood IS NOT NULL AND blood NOT IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-') THEN
        RAISE EXCEPTION 'invalid blood type' USING ERRCODE = '22023';
    END IF;
    IF p_email IS NOT NULL AND p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(profile->'emergency_contacts') = 'array' THEN
        FOR c IN SELECT value FROM jsonb_array_elements(profile->'emergency_contacts') LIMIT 3 LOOP
            IF request_form_clean(c->>'name', 120) IS NOT NULL OR request_form_clean(c->>'phone', 40) IS NOT NULL THEN
                contacts := contacts || jsonb_build_array(jsonb_build_object(
                    'name', coalesce(request_form_clean(c->>'name', 120), ''),
                    'relation', coalesce(request_form_clean(c->>'relation', 60), ''),
                    'phone', coalesce(request_form_clean(c->>'phone', 40), '')));
            END IF;
        END LOOP;
    END IF;
    FOREACH f IN ARRAY fields LOOP
        vis := vis || jsonb_build_object(f, coalesce((profile->'visibility'->>f)::BOOLEAN, false));
    END LOOP;

    UPDATE nfc_owners SET
        name               = request_form_clean(profile->>'name', 120),
        email              = p_email,
        phone              = request_form_clean(profile->>'phone', 40),
        blood_type         = blood,
        allergies          = request_form_clean(profile->>'allergies', 1000),
        conditions         = request_form_clean(profile->>'conditions', 1000),
        medications        = request_form_clean(profile->>'medications', 1000),
        emergency_contacts = contacts,
        notes              = request_form_clean(profile->>'notes', 1000),
        visibility         = vis,
        language           = request_form_clean(profile->>'language', 5)
     WHERE id = p_owner;
END;
$$;

CREATE OR REPLACE FUNCTION public.nfc_owner_json(o public.nfc_owners)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'name', o.name, 'email', o.email, 'phone', o.phone, 'blood_type', o.blood_type,
        'allergies', o.allergies, 'conditions', o.conditions, 'medications', o.medications,
        'emergency_contacts', o.emergency_contacts, 'notes', o.notes, 'visibility', o.visibility,
        'language', o.language, 'consent_at', o.consent_at,
        'tags', coalesce((SELECT jsonb_agg(jsonb_build_object('code', t.code, 'status', t.status) ORDER BY t.created_at)
                            FROM nfc_tags t WHERE t.owner_id = o.id), '[]'::jsonb));
$$;

-- Estado de um chip sem dono: gravado ou só gerado.
CREATE OR REPLACE FUNCTION public.nfc_free_status(t public.nfc_tags)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE WHEN t.written_at IS NOT NULL THEN 'written' ELSE 'blank' END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Página pública e atleta (sem login)
-- ---------------------------------------------------------------------------

-- O que abre ao encostar o celular. Ativo: só os campos que o atleta deixou visíveis.
CREATE OR REPLACE FUNCTION public.nfc_tag_view(code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t    nfc_tags := nfc_find(code);
    o    nfc_owners;
    card JSONB := '{}'::jsonb;
    f    TEXT;
BEGIN
    IF t.id IS NULL THEN
        RETURN jsonb_build_object('status', 'unknown');
    END IF;
    INSERT INTO nfc_scans (tag_id) VALUES (t.id);
    IF t.status <> 'active' OR t.owner_id IS NULL THEN
        RETURN jsonb_build_object('status', CASE WHEN t.status = 'disabled' THEN 'disabled' ELSE 'free' END);
    END IF;
    SELECT * INTO o FROM nfc_owners WHERE id = t.owner_id;
    FOREACH f IN ARRAY ARRAY['name', 'phone', 'blood_type', 'allergies', 'conditions', 'medications', 'emergency_contacts', 'notes'] LOOP
        IF coalesce((o.visibility->>f)::BOOLEAN, false) THEN
            card := card || jsonb_build_object(f, to_jsonb(o) -> f);
        END IF;
    END LOOP;
    RETURN jsonb_build_object('status', 'active', 'card', card, 'language', o.language);
END;
$$;

-- Registra a peça: cria o dono e devolve o link pessoal (só aparece uma vez).
CREATE OR REPLACE FUNCTION public.nfc_claim(code TEXT, profile JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t     nfc_tags := nfc_find(code);
    token TEXT := nfc_new_token();
    o_id  UUID;
BEGIN
    IF t.id IS NULL THEN
        RAISE EXCEPTION 'unknown tag' USING ERRCODE = '22023';
    END IF;
    IF t.owner_id IS NOT NULL OR t.status NOT IN ('blank', 'written') THEN
        RAISE EXCEPTION 'tag already registered' USING ERRCODE = '22023';
    END IF;
    IF coalesce(profile->>'privacy_accepted', '') <> 'true' THEN
        RAISE EXCEPTION 'privacy notice must be accepted' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM nfc_owners WHERE created_at > now() - interval '1 hour') >= 30 THEN
        RAISE EXCEPTION 'too many requests, try again later' USING ERRCODE = '53400';
    END IF;
    INSERT INTO nfc_owners (consent_at, access_hash) VALUES (now(), nfc_hash(token)) RETURNING id INTO o_id;
    PERFORM nfc_apply_profile(o_id, profile);
    UPDATE nfc_tags SET owner_id = o_id, status = 'active' WHERE id = t.id;
    RETURN jsonb_build_object('token', token);
END;
$$;

CREATE OR REPLACE FUNCTION public.nfc_me(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN nfc_owner_json(nfc_owner_by_token(token));
END;
$$;

CREATE OR REPLACE FUNCTION public.nfc_me_save(token TEXT, profile JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    o nfc_owners := nfc_owner_by_token(token);
BEGIN
    PERFORM nfc_apply_profile(o.id, profile);
    SELECT * INTO o FROM nfc_owners WHERE id = o.id;
    RETURN nfc_owner_json(o);
END;
$$;

-- Bloqueia (peça perdida) ou reativa uma peça do próprio atleta.
CREATE OR REPLACE FUNCTION public.nfc_me_block(token TEXT, code TEXT, blocked BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    o nfc_owners := nfc_owner_by_token(token);
BEGIN
    UPDATE nfc_tags SET status = CASE WHEN blocked THEN 'disabled' ELSE 'active' END
     WHERE nfc_tags.code = nfc_me_block.code AND owner_id = o.id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tag not found' USING ERRCODE = '22023';
    END IF;
    RETURN nfc_owner_json(o);
END;
$$;

-- Apaga todos os dados do atleta; as peças voltam a ficar livres.
CREATE OR REPLACE FUNCTION public.nfc_me_delete(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    o nfc_owners := nfc_owner_by_token(token);
BEGIN
    UPDATE nfc_tags t SET owner_id = NULL, status = nfc_free_status(t) WHERE t.owner_id = o.id;
    DELETE FROM nfc_owners WHERE id = o.id;
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Painel da equipe (usuários com login do gestionale)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nfc_staff()
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

CREATE OR REPLACE FUNCTION public.nfc_admin_tags()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM nfc_staff();
    -- Do dono, a equipe vê só nome e e-mail: os dados de saúde ficam com o atleta.
    RETURN coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'code', t.code, 'status', t.status, 'kind', t.kind, 'product_ref', t.product_ref,
            'chip_uid', t.chip_uid, 'locked', t.locked, 'written_at', t.written_at, 'created_at', t.created_at,
            'has_owner', t.owner_id IS NOT NULL, 'owner_name', o.name, 'owner_email', o.email,
            'scans', (SELECT count(*) FROM nfc_scans s WHERE s.tag_id = t.id),
            'last_scan', (SELECT max(s.at) FROM nfc_scans s WHERE s.tag_id = t.id)
        ) ORDER BY t.created_at DESC, t.code)
          FROM nfc_tags t LEFT JOIN nfc_owners o ON o.id = t.owner_id), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.nfc_admin_generate(how_many INTEGER, product_ref TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    codes JSONB := '[]'::jsonb;
    c     TEXT;
BEGIN
    PERFORM nfc_staff();
    IF how_many IS NULL OR how_many < 1 OR how_many > 100 THEN
        RAISE EXCEPTION 'between 1 and 100 codes' USING ERRCODE = '22023';
    END IF;
    FOR i IN 1..how_many LOOP
        LOOP
            c := nfc_random_code();
            EXIT WHEN NOT EXISTS (SELECT 1 FROM nfc_tags WHERE code = c);
        END LOOP;
        INSERT INTO nfc_tags (code, kind, product_ref) VALUES (c, 'athlete', request_form_clean(nfc_admin_generate.product_ref, 120));
        codes := codes || to_jsonb(c);
    END LOOP;
    RETURN codes;
END;
$$;

-- Chip gravado: guarda o número de série e se foi travado.
CREATE OR REPLACE FUNCTION public.nfc_admin_written(code TEXT, chip_uid TEXT, locked BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM nfc_staff();
    UPDATE nfc_tags t SET
        chip_uid   = request_form_clean(nfc_admin_written.chip_uid, 64),
        locked     = coalesce(nfc_admin_written.locked, false),
        written_at = now(),
        status     = CASE WHEN t.status = 'blank' THEN 'written' ELSE t.status END
     WHERE t.code = nfc_admin_written.code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tag not found' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- action: 'block' | 'unblock' | 'unlink' (desvincula o dono; sem outras peças, o dono é apagado)
CREATE OR REPLACE FUNCTION public.nfc_admin_action(code TEXT, action TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t nfc_tags;
BEGIN
    PERFORM nfc_staff();
    SELECT * INTO t FROM nfc_tags WHERE nfc_tags.code = nfc_admin_action.code;
    IF t.id IS NULL THEN
        RAISE EXCEPTION 'tag not found' USING ERRCODE = '22023';
    END IF;
    IF action = 'block' THEN
        UPDATE nfc_tags SET status = 'disabled' WHERE id = t.id;
    ELSIF action = 'unblock' THEN
        UPDATE nfc_tags SET status = CASE WHEN t.owner_id IS NOT NULL THEN 'active' ELSE nfc_free_status(t) END WHERE id = t.id;
    ELSIF action = 'unlink' THEN
        UPDATE nfc_tags SET owner_id = NULL, status = nfc_free_status(t) WHERE id = t.id;
        DELETE FROM nfc_owners o WHERE o.id = t.owner_id AND NOT EXISTS (SELECT 1 FROM nfc_tags x WHERE x.owner_id = o.id);
    ELSE
        RAISE EXCEPTION 'invalid action' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- Link pessoal novo para o dono do chip (o anterior deixa de valer).
CREATE OR REPLACE FUNCTION public.nfc_admin_owner_link(code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    token TEXT := nfc_new_token();
BEGIN
    PERFORM nfc_staff();
    UPDATE nfc_owners o SET access_hash = nfc_hash(token)
      FROM nfc_tags t WHERE t.code = nfc_admin_owner_link.code AND t.owner_id = o.id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tag has no owner' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('token', token);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permissões
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.nfc_random_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nfc_hash(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nfc_caller() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nfc_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nfc_find(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nfc_owner_by_token(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nfc_new_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nfc_apply_profile(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nfc_owner_json(public.nfc_owners) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nfc_free_status(public.nfc_tags) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nfc_staff() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.nfc_tag_view(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nfc_claim(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nfc_me(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nfc_me_save(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nfc_me_block(TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nfc_me_delete(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nfc_tag_view(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nfc_claim(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nfc_me(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nfc_me_save(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nfc_me_block(TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nfc_me_delete(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.nfc_admin_tags() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nfc_admin_generate(INTEGER, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nfc_admin_written(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nfc_admin_action(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nfc_admin_owner_link(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nfc_admin_tags() TO authenticated;
GRANT EXECUTE ON FUNCTION public.nfc_admin_generate(INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nfc_admin_written(TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nfc_admin_action(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nfc_admin_owner_link(TEXT) TO authenticated;
