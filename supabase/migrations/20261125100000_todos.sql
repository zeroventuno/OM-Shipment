-- ============================================================================
-- To Do: a lista da pílula no canto do Gestionale
--
-- Cada login tem a própria lista de itens escritos à mão. Os itens
-- automáticos (pedidos de envio e de retirada pendentes, assistências e
-- garantias paradas, férias para decidir) não ficam aqui: são calculados na
-- tela a partir das próprias tabelas, e somem quando o pedido é resolvido.
--
-- Pode ser rodado de novo sem estragar nada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.todos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   UUID NOT NULL DEFAULT auth.uid(),
    title      TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
    due_date   DATE,
    done_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS todos_owner_idx ON public.todos (owner_id, done_at, created_at DESC);
COMMENT ON TABLE public.todos IS 'Itens escritos à mão na lista To Do; cada login vê só os seus.';

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "todos_own" ON public.todos;
CREATE POLICY "todos_own" ON public.todos
    FOR ALL TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());
REVOKE ALL ON public.todos FROM anon;

DROP TRIGGER IF EXISTS todos_touch ON public.todos;
CREATE TRIGGER todos_touch BEFORE UPDATE ON public.todos
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
