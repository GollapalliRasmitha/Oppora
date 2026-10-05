"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { subscribeWake, WAKE_FAILED_MESSAGE, wakeStatus, WAKING_MESSAGE } from "@/lib/wake";

/**
 * "Waking up the server…" while the sleeping free-tier backend starts (lib/wake.ts).
 * Mounted once in the root layout; the live region is always present so screen
 * readers announce the message when it appears.
 */
export function WakingNotice() {
  const status = useSyncExternalStore(subscribeWake, wakeStatus, () => "idle" as const);
  return (
    // Just below the header/navbar (both 64px), so it never covers the logo or the account menu.
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[76px] z-[60] flex justify-center px-4">
      {status !== "idle" && (
        <p
          className={cn(
            // Solid surface: it floats over page content and must stay legible on anything.
            "flex max-w-md items-center gap-2.5 rounded-full border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink shadow-[var(--shadow-pop)] animate-fade-up",
            status === "failed" && "border-urgent/40",
          )}
        >
          {status === "waking" ? (
            <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-violet" />
          ) : (
            <TriangleAlert aria-hidden className="size-4 shrink-0 text-urgent" />
          )}
          {status === "waking" ? WAKING_MESSAGE : WAKE_FAILED_MESSAGE}
        </p>
      )}
    </div>
  );
}
