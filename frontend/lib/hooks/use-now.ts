"use client";

import { useSyncExternalStore } from "react";
import { now as clockNow } from "@/lib/clock";

let snapshot: Date | null = null;

function subscribe(onChange: () => void) {
  const id = setInterval(() => {
    snapshot = clockNow();
    onChange();
  }, 60_000);
  return () => clearInterval(id);
}

const getSnapshot = () => (snapshot ??= clockNow());
const getServerSnapshot = () => null;

/**
 * Current time on the client (refreshes every minute); `null` during SSR so
 * time-of-day text never causes a hydration mismatch.
 */
export function useNow(): Date | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
