"use client";

import { IntentLink as Link } from "@/components/ui/intent-link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { daysLeft } from "@/lib/domain/dates";
import type { Opportunity } from "@/lib/domain/types";
import { DeadlineIndicator, FeeBadge, MatchMeter, PriorityBadge } from "./badges";
import { Monogram } from "./monogram";
import { OpportunityMenu, type OpportunityActions } from "./opportunity-menu";
import { StatusBadge } from "./opportunity-row";
import { SaveToggle } from "./save-toggle";

export function OpportunityCard({
  opp,
  now,
  onToggleSave,
  actions,
}: {
  opp: Opportunity;
  now: Date;
  onToggleSave: (o: Opportunity) => void;
  /** Adds the ⋯ menu (mark applied, reminder, not interested, hide sender). */
  actions?: OpportunityActions;
}) {
  const href = `/opportunities/${opp.id}`;
  return (
    <GlassCard as="article" interactive aria-labelledby={`card-${opp.id}`} className="flex h-full flex-col p-5">
      <div className="flex items-start gap-3">
        <Monogram name={opp.organization} />
        <div className="min-w-0 flex-1">
          <h2 id={`card-${opp.id}`} className="text-base font-bold leading-snug text-ink">
            <Link href={href} className="hit-y rounded-sm focus-ring hover:text-violet">
              {opp.title}
            </Link>
          </h2>
          <p className="mt-0.5 truncate text-meta font-medium text-ink-3">
            {opp.organization} · {opp.type}
          </p>
        </div>
        <div className="-mr-2 -mt-2 flex">
          <SaveToggle compact saved={opp.saved} title={opp.title} onToggle={() => onToggleSave(opp)} />
          {actions && <OpportunityMenu opp={opp} now={now} actions={actions} />}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <PriorityBadge priority={opp.priority} />
        <StatusBadge opp={opp} />
        <FeeBadge fee={opp.fee} />
      </div>

      <DeadlineIndicator className="mt-4" deadline={opp.deadline} days={daysLeft(opp.deadline, now)} />

      <MatchMeter className="mt-4" value={opp.matchScore} />

      <div className="mt-auto pt-5">
        <Button asChild variant="secondary" className="w-full">
          <Link href={href} aria-label={`View details for ${opp.title}`}>
            View Details <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </GlassCard>
  );
}

export function OpportunityCardSkeleton() {
  return (
    <GlassCard aria-hidden className="p-5">
      <div className="flex gap-3">
        <Skeleton className="size-11" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-9 w-32" />
      <Skeleton className="mt-4 h-2 w-full rounded-full" />
      <Skeleton className="mt-6 h-11 w-full" />
    </GlassCard>
  );
}
