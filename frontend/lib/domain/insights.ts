/** AI Insights shapes. The numbers are computed by the server (backend/core/domain/insights.py). */

import type { ISODate, OpportunityType } from "./types";

export interface TrendPoint {
  date: ISODate;
  /** Axis label: weekday for 7 days, "2 Oct" for longer ranges. */
  label: string;
  /** Full label for tooltips and the table view. */
  fullLabel: string;
  count: number;
}

export interface Insights {
  total: number;
  mostCommonCategory: { type: OpportunityType; count: number; percent: number; tied: boolean } | null;
  topCompany: { name: string; count: number; tied: boolean } | null;
  /** Weekday on which the most opportunities were found in Gmail. */
  bestDay: { weekday: string; count: number; tied: boolean } | null;
  /** Opportunity emails Oppora found per day (new opportunities plus updates, reminders and invitations). */
  trend: TrendPoint[];
  trendTotal: number;
  progress: { applied: number; inProgress: number; saved: number; other: number; total: number; appliedPercent: number };
  worthReviewing: number;
  /** `null` when AI recommendations are turned off (set by the service). */
  recommendation: string | null;
}

export type TrendRange = 7 | 30;
