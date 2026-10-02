"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Save / Saved toggle. `compact` renders an icon-only 44px button. */
export function SaveToggle({
  saved,
  onToggle,
  title,
  compact,
  className,
}: {
  saved: boolean;
  onToggle: () => void;
  /** Opportunity title, for the accessible name. */
  title: string;
  compact?: boolean;
  className?: string;
}) {
  const Icon = saved ? BookmarkCheck : Bookmark;
  if (compact) {
    return (
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? `Saved: ${title}. Remove from saved` : `Save ${title}`}
        title={saved ? "Saved" : "Save"}
        onClick={onToggle}
        className={cn(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-md focus-ring transition-colors duration-200",
          saved ? "text-violet hover:bg-purple/15" : "text-ink-3 hover:bg-white/[.06] hover:text-ink",
          className,
        )}
      >
        <Icon aria-hidden className={cn("size-5", saved && "fill-violet/30")} />
      </button>
    );
  }
  return (
    <Button variant="secondary" aria-pressed={saved} onClick={onToggle} className={cn(saved && "border-violet/50 text-violet", className)}>
      <Icon aria-hidden className={cn(saved && "fill-violet/30")} />
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
