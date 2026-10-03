import type { DashboardStats, Recommendation } from "@/lib/domain/stats";
import type { Opportunity } from "@/lib/domain/types";
import { request } from "./client";

export interface DashboardData {
  stats: DashboardStats;
  latest: Opportunity[];
  upcoming: Opportunity[];
  /** `null` when AI recommendations are turned off in Settings. */
  recommendation: Recommendation | null;
}

const zero = { value: 0, trend: 0, trendLabel: "+0 this week" };
const EMPTY: DashboardData = {
  stats: { total: zero, deadlinesThisWeek: { ...zero, urgent: 0, trendLabel: "0 urgent" }, applied: zero, inProgress: zero, saved: 0 },
  latest: [],
  upcoming: [],
  recommendation: null,
};

/** GET /api/insights/dashboard/ — every number is computed by the server from the user's data. */
export function getDashboard(): Promise<DashboardData> {
  return request<DashboardData>("/insights/dashboard", { empty: () => EMPTY });
}
