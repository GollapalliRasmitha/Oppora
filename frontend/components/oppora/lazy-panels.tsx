"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { NotificationsState } from "@/lib/hooks/use-notifications";
import { useShell } from "./shell-context";

/*
 * The assistant and notifications panels are only needed once opened, so their
 * code (and the dialog machinery under them) stays out of the first load.
 */
const loadAssistant = () => import("./ai-assistant");
const loadNotifications = () => import("./notifications-panel");
const AssistantPanel = dynamic(() => loadAssistant().then((m) => m.AIAssistantPanel), { ssr: false });
const NotificationsDrawer = dynamic(() => loadNotifications().then((m) => m.NotificationsPanel), { ssr: false });

/** True from the first time `open` is true, so a panel stays mounted (the conversation persists). */
function useOpenedOnce(open: boolean) {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened || open;
}

/** Fetches the panel code once the browser is idle after load, so the first open feels instant. */
function usePrefetchWhenIdle() {
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    const run = () => {
      void loadAssistant();
      void loadNotifications();
    };
    const t = setTimeout(() => (w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 5000 }) : run()), 4000);
    return () => clearTimeout(t);
  }, []);
}

export function LazyAIAssistantPanel() {
  const { assistantOpen } = useShell();
  usePrefetchWhenIdle();
  return useOpenedOnce(assistantOpen) ? <AssistantPanel /> : null;
}

export function LazyNotificationsPanel(props: { open: boolean; onOpenChange: (v: boolean) => void; state: NotificationsState }) {
  return useOpenedOnce(props.open) ? <NotificationsDrawer {...props} /> : null;
}
