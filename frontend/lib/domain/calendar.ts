import { parseISODate } from "./dates";
import { addDays, deadlineKind, toISODate } from "./deadlines";
import type { CalendarItem, CalendarKind, ISODate, Interview, Opportunity } from "./types";

export const CALENDAR_KIND_LABEL: Record<CalendarKind, string> = {
  application: "Application deadline",
  hackathon: "Hackathon",
  scholarship: "Scholarship deadline",
  interview: "Interview",
  reminder: "Reminder",
};

/** Reminders fire at 09:00 the day before the deadline (or on the day if that's already past). */
export const REMINDER_HOUR = 9;

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

/**
 * Every calendar item: deadlines (all-day), interviews (timed) and reminders
 * for opportunities where the user turned a reminder on.
 */
export function buildCalendarItems(opps: Opportunity[], interviews: Interview[], now: Date): CalendarItem[] {
  const active = opps.filter((o) => !o.dismissed);
  const byId = new Map(active.map((o) => [o.id, o]));
  const today = toISODate(now);
  const items = deadlineItems(active);

  for (const iv of interviews) {
    const opp = byId.get(iv.opportunityId);
    if (!opp) continue;
    items.push({
      id: iv.id,
      kind: "interview",
      title: iv.title,
      date: toISODate(new Date(iv.start)),
      start: iv.start,
      end: iv.end,
      location: iv.location,
      opportunityId: opp.id,
      organization: opp.organization,
    });
  }

  for (const o of active) {
    if (!o.reminderSet || !o.deadline || o.deadline < today) continue;
    const dayBefore = addDays(o.deadline, -1);
    const date = dayBefore < today ? o.deadline : dayBefore;
    const d = parseISODate(date);
    items.push({
      id: `reminder_${o.id}`,
      kind: "reminder",
      title: o.title,
      date,
      start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), REMINDER_HOUR).toISOString(),
      end: null,
      location: null,
      opportunityId: o.id,
      organization: o.organization,
    });
  }
  return items;
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
