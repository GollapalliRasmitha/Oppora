"use client";

import { IntentLink as Link } from "@/components/ui/intent-link";
import { CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { daysLeft } from "@/lib/domain/dates";
import type { Opportunity } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { DeadlineIndicator, FeeBadge, PriorityBadge } from "./badges";
import { Monogram } from "./monogram";
import { OpportunityMenu, type OpportunityActions } from "./opportunity-menu";

export type { OpportunityActions } from "./opportunity-menu";

export function StatusBadge({ opp }: { opp: Opportunity }) {
  if (opp.application?.status === "applied")
    return (
      <Badge tone="success">
        <CircleCheck aria-hidden />
        Applied
      </Badge>
    );
  if (opp.application?.status === "in_progress") return <Badge tone="blue">In progress</Badge>;
  return null;
}

export function OpportunityRow({ opp, now, actions }: { opp: Opportunity; now: Date; actions: OpportunityActions }) {
  const days = daysLeft(opp.deadline, now);
  const applied = opp.application?.status === "applied";
  const href = `/opportunities/${opp.id}`;

  return (
    <li className="group relative grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 rounded-md px-2 py-3 transition-colors duration-200 hover:bg-tint/[.03] @md:grid-cols-[auto_minmax(0,1fr)_auto_auto] @md:px-3 @3xl:grid-cols-[auto_minmax(0,1fr)_150px_130px_auto_auto]">
      <Monogram name={opp.organization} />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={href} className="truncate text-body font-bold text-ink focus-ring rounded-sm hover:text-violet">
            {opp.title}
          </Link>
          <StatusBadge opp={opp} />
          <FeeBadge fee={opp.fee} className="hidden @3xl:inline-flex" />
        </div>
        <div className="mt-0.5 truncate text-meta font-medium text-ink-3">
          {opp.organization} · {opp.type}
        </div>
      </div>

      {/* Mobile/tablet: compact deadline under the title */}
      <div className="col-span-2 col-start-2 row-start-2 flex flex-wrap items-center gap-2 @3xl:hidden">
        <DeadlineIndicator deadline={opp.deadline} days={days} variant="pill" />
        {opp.priority === "High" && <PriorityBadge priority={opp.priority} />}
        <FeeBadge fee={opp.fee} />
      </div>

      <DeadlineIndicator deadline={opp.deadline} days={days} className="hidden @3xl:col-start-3 @3xl:row-start-1 @3xl:flex" />
      <div className="hidden @3xl:col-start-4 @3xl:row-start-1 @3xl:block">
        <PriorityBadge priority={opp.priority} />
      </div>

      <Button asChild size="sm" variant={applied ? "secondary" : "primary"} className="hidden @md:col-start-3 @md:row-start-1 @md:inline-flex @3xl:col-start-5">
        <Link href={href}>View Details</Link>
      </Button>

      <OpportunityMenu
        opp={opp}
        now={now}
        actions={actions}
        viewDetailsItem="sm:hidden"
        className="col-start-3 row-start-1 @md:col-start-4 @3xl:col-start-6"
      />
    </li>
  );
}

export function OpportunityRowSkeleton({ className }: { className?: string }) {
  return (
    <li aria-hidden className={cn("flex items-center gap-3 px-2 py-3 @md:px-3", className)}>
      <Skeleton className="size-11 shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
      <Skeleton className="hidden h-9 w-28 @3xl:block" />
      <Skeleton className="hidden h-6 w-24 @3xl:block" />
      <Skeleton className="hidden h-9 w-28 @md:block" />
    </li>
  );
}
