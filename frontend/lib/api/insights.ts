import { now as clockNow } from "@/lib/clock";
import { buildCalendarItems } from "@/lib/domain/calendar";
import { computeInsights, type Insights, type TrendRange } from "@/lib/domain/insights";
import type { CalendarItem } from "@/lib/domain/types";
import { db } from "@/lib/mock/store";
import { isEmptyMode, mock } from "./client";

/** Stage 7: GET /api/insights/?range=7 */
export function getInsights(range: TrendRange = 7, now: Date = clockNow()): Promise<Insights> {
  return mock(() => computeInsights(isEmptyMode() ? [] : structuredClone(db.opportunities), now, range));
}

/** Stage 7: GET /api/calendar/ — deadlines, interviews and reminders. */
export function listCalendarItems(now: Date = clockNow()): Promise<CalendarItem[]> {
  return mock(() => (isEmptyMode() ? [] : buildCalendarItems(db.opportunities, db.interviews, now)));
}
