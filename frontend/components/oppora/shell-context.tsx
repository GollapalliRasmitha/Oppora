"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { getCurrentUser } from "@/lib/api";
import type { User } from "@/lib/domain/types";
import { useResource } from "@/lib/hooks/use-resource";

type Shell = {
  user: User | undefined;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
};

const ShellContext = createContext<Shell | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const { data: user } = useResource(getCurrentUser);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const value = useMemo(
    () => ({ user, assistantOpen, setAssistantOpen, notificationsOpen, setNotificationsOpen }),
    [user, assistantOpen, notificationsOpen],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <ShellProvider>");
  return ctx;
}
