-- ============================================================================
-- Referenti: as pessoas dos fornecedores e parceiros (corrieri, portais,
-- despachantes, embalagens…) com quem a equipe trata.
--
-- Não são clientes: ficam numa tabela própria, com empresa, função, telefone
-- e e-mail. A página exporta tudo em vCard (agenda do celular) e CSV.
-- Leitura e edição só para usuários logados.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.partner_contacts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company    TEXT NOT NULL,                 -- ex.: DHL Express Italy
    category   TEXT,                          -- ex.: Corriere, Portale, Dogana
    name       TEXT NOT NULL,                 -- pessoa
    role       TEXT,                          -- ex.: Account manager
    phone      TEXT,
    mobile     TEXT,
    email      TEXT,
    notes      TEXT,
    active     BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.partner_contacts IS 'Referenti di fornitori e partner (corrieri, portali, dogana…): nome, ruolo, telefono, e-mail.';

CREATE INDEX IF NOT EXISTS partner_contacts_company_idx ON public.partner_contacts (lower(company));

ALTER TABLE public.partner_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner_contacts_authenticated_full_access" ON public.partner_contacts;
CREATE POLICY "partner_contacts_authenticated_full_access" ON public.partner_contacts
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.partner_contacts FROM anon;
