"use client";

import { PlayCircle } from "lucide-react";
import { SIGN_IN_URL } from "./google-sign-in-button";
import { WakeLink } from "./wake-link";
import { useShell } from "./shell-context";

/** Shown on every page of the public demo: it's sample data, and changes aren't saved. */
export function DemoBanner() {
  const { user } = useShell();
  if (!user?.readOnly) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line-strong bg-wash px-4 py-2.5 text-sm text-ink">
      <PlayCircle aria-hidden className="size-4 shrink-0 text-violet" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">You&apos;re exploring a read-only demo</span> with sample data, so changes aren&apos;t saved.
      </p>
      <WakeLink href={SIGN_IN_URL} className="hit-y rounded-sm font-semibold text-violet focus-ring hover:text-ink">
        Use your own Gmail
      </WakeLink>
    </div>
  );
}
