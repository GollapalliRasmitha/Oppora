"use client";

import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Save toggle. Not saved = outline bookmark; saved = filled violet bookmark.
 * The accessible name states the current state and what activating does.
 * `compact` renders an icon-only 44px button.
 */
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
  const label = saved ? `Saved. Remove ${title} from saved` : `Not saved. Save ${title}`;
  const icon = (
    <Bookmark
      aria-hidden
      strokeWidth={2}
      className={cn("transition-[fill,color] duration-200", saved ? "fill-violet text-violet" : "fill-none")}
    />
  );

  if (compact) {
    return (
      <button
        type="button"
        aria-label={label}
        title={saved ? "Saved — click to remove" : "Save"}
        onClick={onToggle}
        className={cn(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-md focus-ring transition-colors duration-200 [&_svg]:size-5",
          saved ? "bg-purple/15 hover:bg-purple/25" : "text-ink-3 hover:bg-tint/[.06] hover:text-ink",
          className,
        )}
      >
        {icon}
      </button>
    );
  }
  return (
    <Button
      variant="secondary"
      aria-label={label}
      onClick={onToggle}
      className={cn(saved && "border-violet/60 bg-purple/15 text-violet hover:bg-purple/25", className)}
    >
      {icon}
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
