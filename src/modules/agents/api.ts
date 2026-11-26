import { requireSupabase } from "@/lib/supabase";

/*
 * Números do agente (migration 20261126200000_agent_dashboard).
 *   hub_agent_stats(token, year): o link pessoal, só os próprios números e a
 *     contagem total da OM;
 *   agents_dashboard(year): todos os agentes, para quem tem a área Report.
 */

export interface TypeRow { type: string; n: number; profit?: number }

export interface AgentStats {
  shipments: { n: number; profit: number; by_type: TypeRow[] };
  warranties: { total: number; year: number; open: number; by_status: Record<string, number> };
  tickets: { total: number; year: number; open: number; by_phase: Record<string, number> };
}

export interface OmCounts { n: number; by_type: TypeRow[] }
export interface OmStats extends OmCounts { with_agent: number; profit: number; warranties_open: number; tickets_open: number }

export interface HubStats { year: number; show: boolean; me: AgentStats; om: OmCounts }
export interface DashboardAgent { id: string; name: string; sector: string; active: boolean; stats: AgentStats }
/** b2c: os envios do e-commerce (canal B2C), no formato de um agente; vai sempre no fim. */
export interface Dashboard { year: number; om: OmStats; agents: DashboardAgent[]; b2c?: AgentStats }

export const B2C_ID = "b2c";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const hubAgentStats = (token: string, year: number) => rpc<HubStats>("hub_agent_stats", { token, p_year: year });
export const agentsDashboard = (year: number) => rpc<Dashboard>("agents_dashboard", { p_year: year });

/** Anos que dá para escolher: o atual e os dois anteriores. */
export const yearChoices = (now = new Date()) => {
  const y = now.getFullYear();
  return [y, y - 1, y - 2];
};
