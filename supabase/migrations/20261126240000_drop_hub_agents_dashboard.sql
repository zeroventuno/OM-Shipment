-- ============================================================================
-- Painel Agenti sai do link pessoal (2026-11-26)
--
-- Decisão do Cristiano: o link pessoal mostra só os números da própria
-- pessoa; o painel de todos os agentes fica no Gestionale, com login
-- (agents_dashboard, área Report). Desfaz a 20261126220000: tira as funções
-- do link e a lista de quem via o painel por ele.
-- ============================================================================

DROP FUNCTION IF EXISTS public.hub_agents_dashboard(TEXT, INT);
DROP FUNCTION IF EXISTS public.hub_can_see_agents(TEXT);
DROP TABLE IF EXISTS public.hub_dashboard_viewers;
