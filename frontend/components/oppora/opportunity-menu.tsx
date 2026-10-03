"use client";

import Link from "next/link";
import { Bell, BellOff, Bookmark, BookmarkCheck, CircleCheck, Ellipsis, EyeOff, ThumbsDown } from "lucide-react";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { daysLeft } from "@/lib/domain/dates";
import type { Opportunity } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export type OpportunityActions = {
  onToggleSave: (o: Opportunity) => void;
  onApply: (o: Opportunity) => void;
  onRemind: (o: Opportunity) => void;
  onDismiss: (o: Opportunity) => void;
  /** "Hide all from this sender" (also skips their future emails). */
  onHideSender?: (o: Opportunity) => void;
};

/** The ⋯ menu shared by OpportunityRow (dashboard) and OpportunityCard (Opportunities). */
export function OpportunityMenu({
  opp,
  now,
  actions,
  viewDetailsItem,
  className,
}: {
  opp: Opportunity;
  now: Date;
  actions: OpportunityActions;
  /** Adds "View details" (for layouts that hide the button on small screens). */
  viewDetailsItem?: string;
  className?: string;
}) {
  const days = daysLeft(opp.deadline, now);
  const applied = opp.application?.status === "applied";
  return (
    <Dropdown>
      <DropdownTrigger
        aria-label={`More actions for ${opp.title}`}
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-md text-ink-3 focus-ring hover:bg-white/[.06] hover:text-ink",
          className,
        )}
      >
        <Ellipsis aria-hidden className="size-5" />
      </DropdownTrigger>
      <DropdownContent align="end">
        {viewDetailsItem !== undefined && (
          <DropdownItem asChild className={viewDetailsItem}>
            <Link href={`/opportunities/${opp.id}`}>View details</Link>
          </DropdownItem>
        )}
        <DropdownItem onSelect={() => actions.onToggleSave(opp)}>
          {opp.saved ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
          {opp.saved ? "Remove from saved" : "Save"}
        </DropdownItem>
        <DropdownItem disabled={applied} onSelect={() => actions.onApply(opp)}>
          <CircleCheck aria-hidden />
          {applied ? "Already applied" : "Mark as applied"}
        </DropdownItem>
        <DropdownItem disabled={days !== null && days < 0} onSelect={() => actions.onRemind(opp)}>
          {opp.reminderSet ? <BellOff aria-hidden /> : <Bell aria-hidden />}
          {opp.reminderSet ? "Remove reminder" : "Set reminder"}
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem tone="danger" onSelect={() => actions.onDismiss(opp)}>
          <ThumbsDown aria-hidden />
          Not interested
        </DropdownItem>
        {actions.onHideSender && (
          <DropdownItem tone="danger" onSelect={() => actions.onHideSender?.(opp)}>
            <EyeOff aria-hidden />
            Hide all from this sender
          </DropdownItem>
        )}
      </DropdownContent>
    </Dropdown>
  );
}
