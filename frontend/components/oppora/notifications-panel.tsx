"use client";

import { BellOff, Bell } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { clearAllNotifications, listNotifications, markNotificationRead } from "@/lib/api";
import type { Notification } from "@/lib/domain/types";
import { useResource } from "@/lib/hooks/use-resource";
import { NotificationItem } from "./notification-item";

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

export function NotificationsPanel({
  open,
  onOpenChange,
  state,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  state: ReturnType<typeof useNotifications>;
}) {
  const close = () => onOpenChange(false);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Notifications"
      description={state.status === "success" ? `${state.unread} unread` : undefined}
      icon={
        <span className="flex size-9 items-center justify-center rounded-md bg-purple/15 text-violet">
          <Bell aria-hidden className="size-4" />
        </span>
      }
      footer={
        state.status === "success" && state.data.length > 0 ? (
          <Button variant="secondary" className="w-full" onClick={() => state.clearAll(state.data)}>
            Clear all
          </Button>
        ) : undefined
      }
    >
      {state.status === "loading" && (
        <ul aria-label="Loading notifications" className="space-y-2 p-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex gap-3 p-3">
              <Skeleton className="size-10" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {state.status === "error" && (
        <ErrorState description="We couldn't load your notifications. Check your connection and try again." onRetry={state.reload} />
      )}
      {state.status === "success" &&
        (state.data.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="You're all caught up"
            description="New opportunities, deadline reminders and AI tips will show up here."
          />
        ) : (
          <ul className="space-y-1 p-3">
            {state.data.map((n) => (
              <NotificationItem key={n.id} item={n} onMarkRead={state.markRead} onNavigate={close} />
            ))}
          </ul>
        ))}
    </Drawer>
  );
}
