"use client";

import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { clearAllNotifications, listNotifications, markNotificationRead } from "@/lib/api";
import type { Notification } from "@/lib/domain/types";
import { useResource } from "@/lib/hooks/use-resource";

/** Bell state: the list, the unread count and the actions (the panel itself loads lazily). */
export function useNotifications() {
  const res = useResource(listNotifications);
  const { mutate } = res;

  const markRead = useCallback(
    async (n: Notification) => {
      mutate((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      try {
        await markNotificationRead(n.id);
        toast.success("Marked as read");
      } catch {
        mutate((list) => list.map((x) => (x.id === n.id ? { ...x, read: false } : x)));
        toast.error("Couldn't update the notification. Please try again.");
      }
    },
    [mutate],
  );

  const clearAll = useCallback(
    async (items: Notification[]) => {
      mutate(() => []);
      try {
        await clearAllNotifications(items.map((n) => n.id));
        toast.success("All notifications cleared");
      } catch {
        mutate(() => items);
        toast.error("Couldn't clear notifications. Please try again.");
      }
    },
    [mutate],
  );

  const unread = res.status === "success" ? res.data.filter((n) => !n.read).length : 0;
  return { ...res, unread, markRead, clearAll };
}

export type NotificationsState = ReturnType<typeof useNotifications>;
