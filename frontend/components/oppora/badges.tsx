import { CalendarClock, Flame } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { daysLeftLabel, formatDate, urgencyFor } from "@/lib/domain/dates";
import type { ISODate, Priority } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const PRIORITY_TONE: Record<Priority, BadgeTone> = { High: "pink", Medium: "purple", Low: "neutral" };

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <Badge tone={PRIORITY_TONE[priority]} className={className}>
      {priority === "High" && <Flame aria-hidden />}
      {priority} Priority
    </Badge>
  );
}

const URGENCY_TEXT = {
  urgent: "text-urgent",
  soon: "text-soon",
  later: "text-later",
  passed: "text-ink-3",
  none: "text-ink-3",
} as const;

const URGENCY_TONE = { urgent: "urgent", soon: "soon", later: "later", passed: "neutral", none: "neutral" } as const;

/**
 * Deadline with days left. Colour is never the only signal — the day count
 * is always written out.
 */
export function DeadlineIndicator({
  deadline,
  days,
  variant = "stacked",
  className,
}: {
  deadline: ISODate | null;
  days: number | null;
  variant?: "stacked" | "pill";
  className?: string;
}) {
  const urgency = urgencyFor(days);
  if (variant === "pill") {
    return (
      <Badge tone={URGENCY_TONE[urgency]} className={className}>
        {daysLeftLabel(days)}
      </Badge>
    );
  }
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <CalendarClock aria-hidden className={cn("mt-0.5 size-4 shrink-0", URGENCY_TEXT[urgency])} />
      <div className="leading-tight">
        <div className="text-sm font-semibold text-ink">{deadline ? formatDate(deadline) : "No deadline"}</div>
        <div className={cn("text-meta font-medium", URGENCY_TEXT[urgency])}>{daysLeftLabel(days)}</div>
      </div>
    </div>
  );
}

/** Horizontal match bar with "92% Match" label. */
export function MatchMeter({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        aria-label="Match with your profile"
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.07]"
      >
        <div className="h-full rounded-full bg-[image:var(--grad-ai-border)]" style={{ width: `${v}%` }} />
      </div>
      <span className="text-meta font-semibold text-ink">{v}% Match</span>
    </div>
  );
}
