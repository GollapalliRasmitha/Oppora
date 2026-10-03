import { now } from "@/lib/clock";
import { deriveNotifications } from "@/lib/domain/stats";
import type { Notification } from "@/lib/domain/types";
import { db } from "@/lib/mock/store";
import { isEmptyMode, mock } from "./client";

const ENABLED: Record<Notification["kind"], () => boolean> = {
  new_opportunity: () => db.preferences.notifications.newOpportunities,
  deadline: () => db.preferences.notifications.deadlineReminders,
  ai_recommendation: () => db.preferences.ai.recommendations,
};

/** Stage 7: GET /api/notifications/ — respects the notification settings. */
export function listNotifications(): Promise<Notification[]> {
  return mock(() => {
    if (isEmptyMode()) return [];
    return deriveNotifications(db.opportunities, now())
      .filter((n) => ENABLED[n.kind]())
      .filter((n) => !db.clearedNotificationIds.has(n.id))
      .map((n) => ({ ...n, read: n.read || db.readNotificationIds.has(n.id) }));
  }, 200);
}

export function markNotificationRead(id: string): Promise<void> {
  return mock(() => {
    db.readNotificationIds.add(id);
  }, 120);
}

export function clearAllNotifications(ids: string[]): Promise<void> {
  return mock(() => {
    ids.forEach((id) => db.clearedNotificationIds.add(id));
  }, 120);
}
