"use client";

import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { dismissOpportunity, markApplied, restoreOpportunity, setReminder, setSaved } from "@/lib/api";
import type { Opportunity } from "@/lib/domain/types";

type Updater = (id: string, fn: (o: Opportunity) => Opportunity) => void;

/**
 * Optimistic actions shared by every opportunity list. The caller supplies
 * how to patch its local copy; on failure the change is rolled back.
 */
export function useOpportunityActions({
  update,
  remove,
  reinsert,
  onChanged,
}: {
  update: Updater;
  remove: (id: string) => void;
  reinsert: (opp: Opportunity) => void;
  /** Called after the server confirms a change (e.g. to refresh stats). */
  onChanged?: () => void;
}) {
  const toggleSave = useCallback(
    async (opp: Opportunity) => {
      const next = !opp.saved;
      update(opp.id, (o) => ({ ...o, saved: next }));
      try {
        await setSaved(opp.id, next);
        onChanged?.();
        toast.success(next ? "Saved to your list" : "Removed from saved", { description: opp.title });
      } catch {
        update(opp.id, (o) => ({ ...o, saved: !next }));
        toast.error("Couldn't update saved items. Please try again.");
      }
    },
    [update, onChanged],
  );

  const apply = useCallback(
    async (opp: Opportunity) => {
      const prev = opp.application;
      const ts = new Date().toISOString();
      update(opp.id, (o) => ({
        ...o,
        application: { status: "applied", startedAt: o.application?.startedAt ?? ts, appliedAt: ts },
      }));
      try {
        await markApplied(opp.id);
        onChanged?.();
        toast.success("Marked as applied", { description: opp.title });
      } catch {
        update(opp.id, (o) => ({ ...o, application: prev }));
        toast.error("Couldn't mark as applied. Please try again.");
      }
    },
    [update, onChanged],
  );

  const remind = useCallback(
    async (opp: Opportunity) => {
      const next = !opp.reminderSet;
      update(opp.id, (o) => ({ ...o, reminderSet: next }));
      try {
        await setReminder(opp.id, next);
        onChanged?.();
        toast.success(next ? "Reminder set" : "Reminder removed", {
          description: next ? `We'll remind you before ${opp.title} closes.` : opp.title,
        });
      } catch {
        update(opp.id, (o) => ({ ...o, reminderSet: !next }));
        toast.error("Couldn't set the reminder. Please try again.");
      }
    },
    [update, onChanged],
  );

  const dismiss = useCallback(
    async (opp: Opportunity) => {
      remove(opp.id);
      try {
        await dismissOpportunity(opp.id);
        onChanged?.();
        toast.info("Hidden from your opportunities", {
          description: opp.title,
          action: {
            label: "Undo",
            onClick: () => {
              restoreOpportunity(opp.id)
                .then(() => {
                  reinsert(opp);
                  onChanged?.();
                  toast.success("Restored", { description: opp.title });
                })
                .catch(() => toast.error("Couldn't restore it. Please try again."));
            },
          },
        });
      } catch {
        reinsert(opp);
        toast.error("Couldn't hide this opportunity. Please try again.");
      }
    },
    [remove, reinsert, onChanged],
  );

  return { toggleSave, apply, remind, dismiss };
}
