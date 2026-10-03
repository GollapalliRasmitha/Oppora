import { daysLeft } from "./dates";
import type { Opportunity } from "./types";

/** Match score at or above which an opportunity counts as a strong match. */
export const STRONG_MATCH = 88;
/** "Deadlines this week" / "coming up soon" window, in days from today. */
export const SOON_WINDOW_DAYS = 7;

/*
 * Dashboard numbers, the recommendation copy and notifications are computed
 * by the server (backend/core/domain/stats.py). The UI keeps the shared
 * thresholds and `strongMatches` (assistant greeting).
 */

export interface StatValue {
  value: number;
  /** Change over the last 7 days, shown as the trend line. */
  trend: number;
  trendLabel: string;
}

export interface DashboardStats {
  total: StatValue;
  deadlinesThisWeek: StatValue & { urgent: number };
  applied: StatValue;
  inProgress: StatValue;
  saved: number;
}

const active = (opps: Opportunity[]) => opps.filter((o) => !o.dismissed);

/** Strong matches the user hasn't applied to yet and that are still open. */
export function strongMatches(opps: Opportunity[], now: Date): Opportunity[] {
  return active(opps).filter((o) => {
    const d = daysLeft(o.deadline, now);
    return o.matchScore >= STRONG_MATCH && o.application?.status !== "applied" && (d === null || d >= 0);
  });
}

export interface Recommendation {
  message: string;
  matchIds: string[];
  soonIds: string[];
}
