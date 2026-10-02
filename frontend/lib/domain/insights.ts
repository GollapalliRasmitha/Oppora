import { startOfDay } from "./dates";
import { addDays, toISODate } from "./deadlines";
import { strongMatches } from "./stats";
import type { ISODate, Opportunity, OpportunityType } from "./types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const shortDay = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

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
  trend: TrendPoint[];
  trendTotal: number;
  progress: { applied: number; inProgress: number; saved: number; other: number; total: number; appliedPercent: number };
  worthReviewing: number;
  recommendation: string;
}

export type TrendRange = 7 | 30;

/** Highest count wins; ties are reported (never silently broken) and the first in `order` is shown. */
function top<K extends string>(counts: Map<K, number>, order: (a: K, b: K) => number) {
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || order(a[0], b[0]));
  if (!entries.length) return null;
  const [key, count] = entries[0];
  return { key, count, tied: entries.length > 1 && entries[1][1] === count };
}

export function computeInsights(opps: Opportunity[], now: Date, range: TrendRange = 7): Insights {
  const list = opps.filter((o) => !o.dismissed);
  const total = list.length;

  const byType = new Map<OpportunityType, number>();
  const byOrg = new Map<string, number>();
  const byWeekday = new Map<string, number>();
  for (const o of list) {
    byType.set(o.type, (byType.get(o.type) ?? 0) + 1);
    byOrg.set(o.organization, (byOrg.get(o.organization) ?? 0) + 1);
    const wd = WEEKDAYS[new Date(o.discoveredAt).getDay()];
    byWeekday.set(wd, (byWeekday.get(wd) ?? 0) + 1);
  }
  const cat = top(byType, (a, b) => a.localeCompare(b));
  const org = top(byOrg, (a, b) => a.localeCompare(b));
  // Monday-first tie order.
  const mondayFirst = (d: string) => (WEEKDAYS.indexOf(d) + 6) % 7;
  const day = top(byWeekday, (a, b) => mondayFirst(a) - mondayFirst(b));

  // Daily counts of opportunities found, oldest → today.
  const today = toISODate(startOfDay(now));
  const trend: TrendPoint[] = Array.from({ length: range }, (_, i) => {
    const date = addDays(today, i - (range - 1));
    const d = new Date(`${date}T00:00:00`);
    return {
      date,
      label: range === 7 ? shortDay.format(d) : shortDate.format(d),
      fullLabel: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(d),
      count: 0,
    };
  });
  const index = new Map(trend.map((p, i) => [p.date, i]));
  for (const o of list) {
    const i = index.get(toISODate(new Date(o.discoveredAt)));
    if (i !== undefined) trend[i].count++;
  }

  const applied = list.filter((o) => o.application?.status === "applied").length;
  const inProgress = list.filter((o) => o.application?.status === "in_progress").length;
  const saved = list.filter((o) => !o.application && o.saved).length;
  const worthReviewing = strongMatches(list, now).length;

  return {
    total,
    mostCommonCategory: cat ? { type: cat.key, count: cat.count, percent: Math.round((cat.count / total) * 100), tied: cat.tied } : null,
    topCompany: org ? { name: org.key, count: org.count, tied: org.tied } : null,
    bestDay: day ? { weekday: day.key, count: day.count, tied: day.tied } : null,
    trend,
    trendTotal: trend.reduce((s, p) => s + p.count, 0),
    progress: {
      applied,
      inProgress,
      saved,
      other: total - applied - inProgress - saved,
      total,
      appliedPercent: total ? Math.round((applied / total) * 100) : 0,
    },
    worthReviewing,
    recommendation:
      worthReviewing > 0
        ? `Based on your profile, you have ${worthReviewing} ${worthReviewing === 1 ? "opportunity" : "opportunities"} worth reviewing this week.`
        : "Nothing new to review this week — Oppora will keep watching your inbox.",
  };
}
