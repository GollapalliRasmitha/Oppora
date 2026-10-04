import Link from "next/link";
import { BellRing, BriefcaseBusiness, GraduationCap, MapPin, Trophy, UsersRound, type LucideIcon } from "lucide-react";
import { CALENDAR_KIND_LABEL, timeLabel } from "@/lib/domain/calendar";
import { daysLeft, daysLeftLabel, urgencyFor } from "@/lib/domain/dates";
import type { CalendarItem, CalendarKind, Urgency } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const KIND_ICON: Record<CalendarKind, LucideIcon> = {
  application: BriefcaseBusiness,
  hackathon: Trophy,
  scholarship: GraduationCap,
  interview: UsersRound,
  reminder: BellRing,
};
/** Back-compat alias used by DeadlineItem. */
export const DEADLINE_KIND_ICON = KIND_ICON;

/** Colour by event type (Calendar page). Icons + labels carry identity too. */
export const KIND_CHIP: Record<CalendarKind, string> = {
  application: "border-violet/40 bg-purple/15 text-violet",
  hackathon: "border-pink/40 bg-pink/12 text-pink",
  scholarship: "border-success/40 bg-success/12 text-success",
  interview: "border-blue/40 bg-blue/12 text-blue",
  reminder: "border-line-strong bg-tint/[.06] text-ink-2",
};

/** Colour by deadline urgency (Deadlines page). */
export const URGENCY_CHIP: Record<Urgency, string> = {
  urgent: "border-urgent/40 bg-urgent/15 text-urgent",
  soon: "border-soon/40 bg-soon/15 text-soon",
  later: "border-later/40 bg-later/15 text-later",
  passed: "border-line bg-tint/[.04] text-ink-3",
  none: "border-line bg-tint/[.04] text-ink-3",
};

const URGENCY_DOT: Record<Urgency, string> = {
  urgent: "bg-urgent",
  soon: "bg-soon",
  later: "bg-later",
  passed: "bg-ink-3",
  none: "bg-ink-3",
};

const KIND_DOT: Record<CalendarKind, string> = {
  application: "bg-violet",
  hackathon: "bg-pink",
  scholarship: "bg-success",
  interview: "bg-blue",
  reminder: "bg-ink-2",
};

export type ColorBy = "urgency" | "kind";

const isDeadline = (it: CalendarItem) => it.kind !== "interview" && it.kind !== "reminder";

export function eventWhen(it: CalendarItem, now: Date) {
  return isDeadline(it) ? daysLeftLabel(daysLeft(it.date, now)) : timeLabel(it);
}

export function eventLabel(it: CalendarItem, now: Date) {
  return `${it.title}, ${CALENDAR_KIND_LABEL[it.kind]}, ${eventWhen(it, now)}`;
}

function chipClass(it: CalendarItem, now: Date, colorBy: ColorBy) {
  return colorBy === "kind" ? KIND_CHIP[it.kind] : URGENCY_CHIP[urgencyFor(daysLeft(it.date, now))];
}

/**
 * Something on a calendar, linking to its opportunity.
 * `chip` — compact (month cells); `dot` — decorative marker for small cells;
 * `card` — type, time, title and (when its container is ≥ 18rem) organizer and
 * place. Put cards inside an `@container`.
 */
export function CalendarEvent({
  item,
  now,
  variant = "chip",
  colorBy = "urgency",
  className,
}: {
  item: CalendarItem;
  now: Date;
  variant?: "chip" | "dot" | "card";
  colorBy?: ColorBy;
  className?: string;
}) {
  const Icon = KIND_ICON[item.kind];
  const href = `/opportunities/${item.opportunityId}`;

  if (variant === "dot") {
    const dot = colorBy === "kind" ? KIND_DOT[item.kind] : URGENCY_DOT[urgencyFor(daysLeft(item.date, now))];
    return <span aria-hidden className={cn("inline-block size-1.5 rounded-full @lg:size-2", dot, className)} />;
  }

  if (variant === "card") {
    return (
      <Link
        href={href}
        className={cn(
          "flex gap-2.5 rounded-md border p-2.5 focus-ring transition-[filter,transform] duration-200 hover:-translate-y-px hover:brightness-125",
          chipClass(item, now, colorBy),
          className,
        )}
      >
        <Icon aria-hidden className="mt-0.5 hidden size-4 shrink-0 @[9rem]:block" />
        <span className="min-w-0 text-left">
          <span className="block text-micro font-semibold uppercase tracking-wide opacity-90">
            <span className="hidden @2xs:inline">{CALENDAR_KIND_LABEL[item.kind]} · </span>
            {eventWhen(item, now)}
          </span>
          <span className="sr-only @2xs:hidden">{CALENDAR_KIND_LABEL[item.kind]}</span>
          <span className="line-clamp-2 text-sm font-bold text-ink @2xs:line-clamp-1">{item.title}</span>
          <span className="hidden truncate text-meta text-ink-2 @2xs:block">{item.organization}</span>
          {item.kind === "interview" && (
            <span className="mt-0.5 hidden items-center gap-1 text-meta text-ink-2 @2xs:flex">
              <MapPin aria-hidden className="size-3" />
              {item.location ?? <span className="italic text-ink-3">Location not mentioned in email</span>}
            </span>
          )}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-label={eventLabel(item, now)}
      title={eventLabel(item, now)}
      className={cn(
        "flex min-h-6 items-center gap-1 truncate rounded-sm border px-1.5 py-0.5 text-micro font-semibold leading-tight focus-ring transition-[filter] hover:brightness-125",
        chipClass(item, now, colorBy),
        className,
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{item.title}</span>
    </Link>
  );
}

/** Colour key for whichever scheme a calendar uses. */
export function CalendarLegend({ colorBy }: { colorBy: ColorBy }) {
  const items =
    colorBy === "urgency"
      ? [
          { cls: "bg-urgent", label: "3 days or less" },
          { cls: "bg-soon", label: "4–10 days" },
          { cls: "bg-later", label: "More than 10 days" },
          { cls: "bg-ink-3", label: "Closed" },
        ]
      : (Object.keys(KIND_DOT) as CalendarKind[]).map((k) => ({ cls: KIND_DOT[k], label: CALENDAR_KIND_LABEL[k], kind: k }));
  return (
    <ul aria-label={colorBy === "urgency" ? "Urgency colours" : "Event types"} className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1">
      {items.map((i) => {
        const Icon = "kind" in i ? KIND_ICON[i.kind as CalendarKind] : null;
        return (
          <li key={i.label} className="flex items-center gap-1.5 text-meta text-ink-3">
            <span aria-hidden className={`size-2 rounded-full ${i.cls}`} />
            {Icon && <Icon aria-hidden className="size-3.5" />}
            {i.label}
          </li>
        );
      })}
    </ul>
  );
}
