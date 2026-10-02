"use client";

import Link from "next/link";
import { ArrowUpRight, Bell, BellRing, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { daysLeft, parseISODate, urgencyFor } from "@/lib/domain/dates";
import { DEADLINE_KIND_LABEL, deadlineKind } from "@/lib/domain/deadlines";
import type { Opportunity } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { DeadlineIndicator } from "./badges";
import { DEADLINE_KIND_ICON, URGENCY_CHIP } from "./calendar-event";

const monFmt = new Intl.DateTimeFormat("en-GB", { month: "short" });

/** One deadline with Set Reminder · Open Opportunity · Mark Complete. Coloured by urgency. */
export function DeadlineItem({
  opp,
  now,
  onRemind,
  onComplete,
}: {
  opp: Opportunity;
  now: Date;
  onRemind: (o: Opportunity) => void;
  onComplete: (o: Opportunity) => void;
}) {
  const days = daysLeft(opp.deadline, now);
  const urgency = urgencyFor(days);
  const closed = days !== null && days < 0;
  const done = opp.application?.status === "applied";
  const date = opp.deadline ? parseISODate(opp.deadline) : null;
  const kind = deadlineKind(opp);
  const Icon = DEADLINE_KIND_ICON[kind];

  return (
    <li className={cn("rounded-md border border-line bg-white/[.03] p-3", closed && "opacity-75")}>
      <div className="flex gap-3">
        <div
          aria-hidden
          className={cn("flex w-12 shrink-0 flex-col items-center justify-center rounded-md border py-1.5", URGENCY_CHIP[urgency])}
        >
          <span className="text-lg font-extrabold leading-none">{date?.getDate() ?? "–"}</span>
          <span className="text-[12px] font-semibold uppercase">{date ? monFmt.format(date) : ""}</span>
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/opportunities/${opp.id}`}
            className="block truncate rounded-sm text-sm font-bold text-ink focus-ring hover:text-violet"
          >
            {opp.title}
          </Link>
          <p className="flex items-center gap-1 truncate text-meta text-ink-3">
            <Icon aria-hidden className="size-3.5 shrink-0" />
            {DEADLINE_KIND_LABEL[kind]} · {opp.organization}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <DeadlineIndicator deadline={opp.deadline} days={days} variant="pill" />
            {done && (
              <span className="inline-flex items-center gap-1 text-meta font-semibold text-success">
                <CircleCheck aria-hidden className="size-3.5" /> Completed
              </span>
            )}
            {opp.reminderSet && !closed && (
              <span className="inline-flex items-center gap-1 text-meta font-semibold text-violet">
                <BellRing aria-hidden className="size-3.5" /> Reminder on
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 border-t border-line pt-2 [&>*]:h-auto [&>*]:min-h-11 [&>*]:flex-col [&>*]:gap-0.5 [&>*]:px-1 [&>*]:text-xs">
        <Button
          variant="ghost"
          disabled={closed}
          onClick={() => onRemind(opp)}
          aria-label={opp.reminderSet ? `Remove reminder for ${opp.title}` : `Set reminder for ${opp.title}`}
        >
          {opp.reminderSet ? <BellRing aria-hidden className="text-violet" /> : <Bell aria-hidden />}
          {opp.reminderSet ? "Reminder set" : "Set Reminder"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/opportunities/${opp.id}`} aria-label={`Open ${opp.title}`}>
            <ArrowUpRight aria-hidden /> Open
          </Link>
        </Button>
        <Button
          variant="ghost"
          disabled={done}
          onClick={() => onComplete(opp)}
          aria-label={done ? `${opp.title} is complete` : `Mark ${opp.title} complete`}
          className={done ? "text-success disabled:opacity-100" : undefined}
        >
          <CircleCheck aria-hidden />
          {done ? "Completed" : "Mark Complete"}
        </Button>
      </div>
    </li>
  );
}

export function DeadlineItemSkeleton() {
  return (
    <li aria-hidden className="rounded-md border border-line p-3">
      <div className="flex gap-3">
        <Skeleton className="h-12 w-12" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </div>
    </li>
  );
}
