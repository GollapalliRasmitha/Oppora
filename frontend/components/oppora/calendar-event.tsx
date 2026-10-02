import Link from "next/link";
import { BriefcaseBusiness, GraduationCap, Trophy, type LucideIcon } from "lucide-react";
import { daysLeft, daysLeftLabel, urgencyFor } from "@/lib/domain/dates";
import { DEADLINE_KIND_LABEL, deadlineKind, type DeadlineKind } from "@/lib/domain/deadlines";
import type { Opportunity, Urgency } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const DEADLINE_KIND_ICON: Record<DeadlineKind, LucideIcon> = {
  application: BriefcaseBusiness,
  hackathon: Trophy,
  scholarship: GraduationCap,
};

export const URGENCY_CHIP: Record<Urgency, string> = {
  urgent: "border-urgent/40 bg-urgent/15 text-urgent",
  soon: "border-soon/40 bg-soon/15 text-soon",
  later: "border-later/40 bg-later/15 text-later",
  passed: "border-line bg-white/[.04] text-ink-3",
  none: "border-line bg-white/[.04] text-ink-3",
};

export const URGENCY_DOT: Record<Urgency, string> = {
  urgent: "bg-urgent",
  soon: "bg-soon",
  later: "bg-later",
  passed: "bg-ink-3",
  none: "bg-ink-3",
};

export function eventLabel(opp: Opportunity, now: Date) {
  return `${opp.title}, ${DEADLINE_KIND_LABEL[deadlineKind(opp)]}, ${daysLeftLabel(daysLeft(opp.deadline, now))}`;
}

/**
 * A deadline on a calendar. `chip` is a compact link to the opportunity;
 * `dot` is a decorative urgency marker for small cells.
 */
export function CalendarEvent({
  opp,
  now,
  variant = "chip",
  className,
}: {
  opp: Opportunity;
  now: Date;
  variant?: "chip" | "dot";
  className?: string;
}) {
  const urgency = urgencyFor(daysLeft(opp.deadline, now));
  if (variant === "dot") {
    return <span aria-hidden className={cn("inline-block size-1.5 rounded-full @lg:size-2", URGENCY_DOT[urgency], className)} />;
  }
  const Icon = DEADLINE_KIND_ICON[deadlineKind(opp)];
  return (
    <Link
      href={`/opportunities/${opp.id}`}
      aria-label={eventLabel(opp, now)}
      title={eventLabel(opp, now)}
      className={cn(
        "flex min-h-6 items-center gap-1 truncate rounded-[6px] border px-1.5 py-0.5 text-[12px] font-semibold leading-tight focus-ring transition-[filter] hover:brightness-125",
        URGENCY_CHIP[urgency],
        className,
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{opp.title}</span>
    </Link>
  );
}
