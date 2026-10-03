import { parseISODate } from "./dates";
import { addDays, deadlineKind, toISODate } from "./deadlines";
import type { CalendarItem, CalendarKind, ISODate, Opportunity } from "./types";

export const CALENDAR_KIND_LABEL: Record<CalendarKind, string> = {
  application: "Application deadline",
  hackathon: "Hackathon",
  scholarship: "Scholarship deadline",
  interview: "Interview",
  reminder: "Reminder",
};

/** A deadline as an all-day calendar item. */
export function deadlineItem(o: Opportunity): CalendarItem {
  return {
    id: `deadline_${o.id}`,
    kind: deadlineKind(o),
    title: o.title,
    date: o.deadline!,
    start: null,
    end: null,
    location: null,
    opportunityId: o.id,
    organization: o.organization,
  };
}

export function deadlineItems(opps: Opportunity[]): CalendarItem[] {
  return opps.filter((o) => !o.dismissed && o.deadline).map(deadlineItem);
}

/** All-day first, then by start time, then title. */
export function compareItems(a: CalendarItem, b: CalendarItem): number {
  if (!a.start !== !b.start) return a.start ? 1 : -1;
  if (a.start && b.start && a.start !== b.start) return a.start < b.start ? -1 : 1;
  return a.title.localeCompare(b.title);
}

export function itemsByDay(items: CalendarItem[]): Map<ISODate, CalendarItem[]> {
  const map = new Map<ISODate, CalendarItem[]>();
  for (const it of items) map.set(it.date, [...(map.get(it.date) ?? []), it]);
  for (const list of map.values()) list.sort(compareItems);
  return map;
}

/** Monday-first week containing `iso`. */
export function weekOf(iso: ISODate): ISODate[] {
  const d = parseISODate(iso);
  const monday = addDays(iso, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export function timeLabel(it: CalendarItem): string {
  if (!it.start) return "All day";
  const start = timeFmt.format(new Date(it.start));
  return it.end ? `${start}–${timeFmt.format(new Date(it.end))}` : start;
}

export type CalendarView = "month" | "week" | "day";
export const CALENDAR_VIEWS: CalendarView[] = ["month", "week", "day"];

export function parseView(v: string | null): CalendarView {
  return v === "week" || v === "day" ? v : "month";
}

/** Accepts only real calendar dates ("2026-13-99" would otherwise roll over into a valid Date). */
export function parseDateParam(v: string | null, fallback: ISODate): ISODate {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && toISODate(parseISODate(v)) === v ? v : fallback;
}

/** Moves the anchor date one view-step back/forward. */
export function shiftDate(iso: ISODate, view: CalendarView, dir: -1 | 1): ISODate {
  if (view === "day") return addDays(iso, dir);
  if (view === "week") return addDays(iso, 7 * dir);
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + dir, 1));
}
