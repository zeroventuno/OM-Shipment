-- Chips NFC: a área de gestão fica só para quem está na lista nfc_admins.
-- O NFC é um produto à parte do Gestionale; os outros logins não veem nem
-- chamam as funções de gestão. As páginas públicas (/t/<code>, cadastro e
-- edição pelo link pessoal) continuam iguais.

CREATE TABLE IF NOT EXISTS public.nfc_admins (
    user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nfc_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nfc_admins FROM PUBLIC, anon, authenticated;

-- Cristiano
INSERT INTO public.nfc_admins (user_id)
SELECT id FROM auth.users WHERE id = '2454d12f-baa3-423f-a2c5-82b1e6011f61'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.nfc_staff()
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM nfc_admins WHERE user_id = auth.uid()) THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.nfc_staff() FROM PUBLIC, anon, authenticated;

-- Para o menu: o login atual pode ver a área NFC?
CREATE OR REPLACE FUNCTION public.nfc_can_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM nfc_admins WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.nfc_can_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nfc_can_admin() TO authenticated;
