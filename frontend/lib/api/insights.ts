import type { Insights, TrendRange } from "@/lib/domain/insights";
import type { CalendarItem } from "@/lib/domain/types";
import { request } from "./client";

const EMPTY: Insights = {
  total: 0,
  mostCommonCategory: null,
  topCompany: null,
  bestDay: null,
  trend: [],
  trendTotal: 0,
  progress: { applied: 0, inProgress: 0, saved: 0, other: 0, total: 0, appliedPercent: 0 },
  worthReviewing: 0,
  recommendation: null,
};

/** GET /api/insights/?range=7|30 */
export function getInsights(range: TrendRange = 7): Promise<Insights> {
  return request<Insights>("/insights", { query: { range }, empty: () => EMPTY });
}

/** GET /api/deadlines/calendar/ — deadlines, interviews and reminders. */
export function listCalendarItems(): Promise<CalendarItem[]> {
  return request<CalendarItem[]>("/deadlines/calendar", { empty: () => [] });
}
