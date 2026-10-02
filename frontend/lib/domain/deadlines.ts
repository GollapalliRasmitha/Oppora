import { daysLeft, parseISODate } from "./dates";
import { SOON_WINDOW_DAYS } from "./stats";
import type { ISODate, Opportunity } from "./types";

/** What kind of date an opportunity deadline is (drives icon + label). */
export type DeadlineKind = "application" | "hackathon" | "scholarship";

export function deadlineKind(o: Pick<Opportunity, "type">): DeadlineKind {
  if (o.type === "Hackathon" || o.type === "Competition") return "hackathon";
  if (o.type === "Scholarship" || o.type === "Fellowship") return "scholarship";
  return "application";
}

export const DEADLINE_KIND_LABEL: Record<DeadlineKind, string> = {
  application: "Application deadline",
  hackathon: "Hackathon registration",
  scholarship: "Scholarship deadline",
};

const pad = (n: number) => String(n).padStart(2, "0");
export const toISODate = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Opportunities with a deadline, grouped by date. */
export function eventsByDay(opps: Opportunity[]): Map<ISODate, Opportunity[]> {
  const map = new Map<ISODate, Opportunity[]>();
  for (const o of opps) {
    if (o.dismissed || !o.deadline) continue;
    map.set(o.deadline, [...(map.get(o.deadline) ?? []), o]);
  }
  return map;
}

export interface DeadlineGroups {
  thisWeek: Opportunity[];
  later: Opportunity[];
  closed: Opportunity[];
}

/** This week = next 0–7 days (same as the dashboard); later = after that; closed = passed (most recent first). */
export function groupDeadlines(opps: Opportunity[], now: Date): DeadlineGroups {
  const withDays = opps
    .filter((o) => !o.dismissed && o.deadline)
    .map((o) => ({ o, d: daysLeft(o.deadline, now)! }))
    .sort((a, b) => a.d - b.d);
  return {
    thisWeek: withDays.filter((x) => x.d >= 0 && x.d <= SOON_WINDOW_DAYS).map((x) => x.o),
    later: withDays.filter((x) => x.d > SOON_WINDOW_DAYS).map((x) => x.o),
    closed: withDays.filter((x) => x.d < 0).reverse().map((x) => x.o),
  };
}

/** 6×7 grid of dates for a month view, weeks starting on Monday. */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i));
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}
