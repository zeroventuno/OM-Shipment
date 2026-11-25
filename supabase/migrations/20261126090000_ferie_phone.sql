-- ============================================================================
-- Ferie: celular da pessoa, para avisar a resposta pelo WhatsApp
--
-- Quem aprova abre o WhatsApp com a mensagem pronta (resposta + link
-- pessoal). O número fica só no escritório: o link pessoal não o devolve.
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_phone_len;
ALTER TABLE public.employees ADD CONSTRAINT employees_phone_len CHECK (phone IS NULL OR length(phone) <= 40);
