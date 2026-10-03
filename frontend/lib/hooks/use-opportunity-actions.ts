"use client";

import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { dismissOpportunity, hideSender as hideSenderApi, markApplied, restoreOpportunity, setReminder, setSaved, showSender } from "@/lib/api";
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
  refresh,
}: {
  update: Updater;
  /** Only needed by lists that support "Not interested". */
  remove?: (id: string) => void;
  reinsert?: (opp: Opportunity) => void;
  /** Called after the server confirms a change (e.g. to refresh stats). */
  onChanged?: () => void;
  /** Reloads the list (after "Show again" brings several opportunities back). */
  refresh?: () => void;
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
      remove?.(opp.id);
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
                  reinsert?.(opp);
                  onChanged?.();
                  toast.success("Restored", { description: opp.title });
                })
                .catch(() => toast.error("Couldn't restore it. Please try again."));
            },
          },
        });
      } catch {
        reinsert?.(opp);
        toast.error("Couldn't hide this opportunity. Please try again.");
      }
    },
    [remove, reinsert, onChanged],
  );

  const hideSender = useCallback(
    async (opp: Opportunity) => {
      try {
        const rule = await hideSenderApi(opp.id);
        rule.hiddenOpportunityIds.forEach((id) => remove?.(id));
        onChanged?.();
        const n = rule.hiddenOpportunityIds.length;
        toast.info(`Hid ${n} ${n === 1 ? "opportunity" : "opportunities"} from ${rule.senderName || rule.senderEmail}`, {
          description: `New emails from ${rule.senderEmail} will be skipped. Undo, or show them again from Settings.`,
          action: {
            label: "Undo",
            onClick: () => {
              showSender(rule.id)
                .then(() => {
                  (refresh ?? onChanged)?.();
                  toast.success("Showing this sender again", { description: rule.senderEmail });
                })
                .catch(() => toast.error("Couldn't undo. Please try again from Settings."));
            },
          },
        });
      } catch {
        toast.error("Couldn't hide this sender. Please try again.");
      }
    },
    [remove, onChanged, refresh],
  );

  return { toggleSave, apply, remind, dismiss, hideSender };
}
