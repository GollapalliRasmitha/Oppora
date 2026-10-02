import type { ISODate, Urgency } from "./types";

const DAY_MS = 86_400_000;

/** Local midnight for a Date. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parses a date-only ISO string ("2026-10-05") as local midnight. */
export function parseISODate(value: ISODate): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Whole calendar days from `now` to the deadline. Negative once passed. */
export function daysLeft(deadline: ISODate | null, now: Date): number | null {
  if (!deadline) return null;
  const diff = parseISODate(deadline).getTime() - startOfDay(now).getTime();
  return Math.round(diff / DAY_MS);
}

/** red ≤ 3 days · orange 4–10 · blue > 10. */
export function urgencyFor(days: number | null): Urgency {
  if (days === null) return "none";
  if (days < 0) return "passed";
  if (days <= 3) return "urgent";
  if (days <= 10) return "soon";
  return "later";
}

export function daysLeftLabel(days: number | null): string {
  if (days === null) return "No deadline mentioned";
  if (days < 0) return "Closed";
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function formatDate(value: ISODate | null, opts: { short?: boolean } = {}): string {
  if (!value) return "Not mentioned in email";
  return (opts.short ? shortFmt : dateFmt).format(parseISODate(value));
}

/** True when `iso` falls within the 7 days ending at `now`. */
export function isWithinLastWeek(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t <= now.getTime() && now.getTime() - t <= 7 * DAY_MS;
}

export function relativeTime(iso: string, now: Date): string {
  const sec = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}

export function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Good Morning";
  if (h >= 12 && h < 17) return "Good Afternoon";
  return "Good Evening";
}
