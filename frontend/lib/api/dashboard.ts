import { now as clockNow } from "@/lib/clock";
import {
  buildRecommendation,
  computeDashboardStats,
  latestOpportunities,
  upcomingDeadlines,
  type DashboardStats,
  type Recommendation,
} from "@/lib/domain/stats";
import type { Opportunity } from "@/lib/domain/types";
import { db } from "@/lib/mock/store";
import { isEmptyMode, mock } from "./client";

export interface DashboardData {
  stats: DashboardStats;
  latest: Opportunity[];
  upcoming: Opportunity[];
  recommendation: Recommendation;
}

/** Stage 7: GET /api/insights/dashboard/ */
export function getDashboard(now: Date = clockNow()): Promise<DashboardData> {
  return mock(() => {
    const opps = isEmptyMode() ? [] : structuredClone(db.opportunities);
    return {
      stats: computeDashboardStats(opps, now),
      latest: latestOpportunities(opps),
      upcoming: upcomingDeadlines(opps, now),
      recommendation: buildRecommendation(opps, now),
    };
  });
}
