import type { Notification } from "@/lib/domain/types";
import { request } from "./client";

/** GET /api/notifications/ — derived from the user's data and filtered by their settings. */
export function listNotifications(): Promise<Notification[]> {
  return request<Notification[]>("/notifications", { empty: () => [] });
}

export async function markNotificationRead(id: string): Promise<void> {
  await request(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export async function clearAllNotifications(ids: string[]): Promise<void> {
  await request("/notifications/clear", { method: "POST", body: { ids } });
}
