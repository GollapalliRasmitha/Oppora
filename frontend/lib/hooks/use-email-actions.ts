"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "@/components/ui/toast";
import { extractOpportunity, setEmailArchived, setEmailRead, setEmailSaved } from "@/lib/api";
import type { Email, Opportunity } from "@/lib/domain/types";

type Patch = (id: string, fn: (e: Email) => Email) => void;

/**
 * Optimistic Inbox actions with toasts and rollback. `onExtracted` lets the
 * caller add a newly found opportunity to its local data.
 */
export function useEmailActions({ patch, onExtracted }: { patch: Patch; onExtracted: (o: Opportunity) => void }) {
  const router = useRouter();
  const [extracting, setExtracting] = useState<Set<string>>(new Set());

  /** Opening an email marks it read (silently — it's navigation, not a setting). */
  const open = useCallback(
    (e: Email) => {
      if (e.read) return;
      patch(e.id, (x) => ({ ...x, read: true }));
      setEmailRead(e.id, true).catch(() => patch(e.id, (x) => ({ ...x, read: false })));
    },
    [patch],
  );

  const toggleRead = useCallback(
    async (e: Email) => {
      const next = !e.read;
      patch(e.id, (x) => ({ ...x, read: next }));
      try {
        await setEmailRead(e.id, next);
        toast.success(next ? "Marked as read" : "Marked as unread");
      } catch {
        patch(e.id, (x) => ({ ...x, read: !next }));
        toast.error("Couldn't update the email. Please try again.");
      }
    },
    [patch],
  );

  const toggleSave = useCallback(
    async (e: Email) => {
      const next = !e.saved;
      patch(e.id, (x) => ({ ...x, saved: next }));
      try {
        await setEmailSaved(e.id, next);
        toast.success(next ? "Email saved" : "Removed from saved", { description: e.subject });
      } catch {
        patch(e.id, (x) => ({ ...x, saved: !next }));
        toast.error("Couldn't save the email. Please try again.");
      }
    },
    [patch],
  );

  const archive = useCallback(
    async (e: Email) => {
      patch(e.id, (x) => ({ ...x, archived: true }));
      try {
        await setEmailArchived(e.id, true);
        toast.info("Email archived", {
          description: e.subject,
          action: {
            label: "Undo",
            onClick: () => {
              patch(e.id, (x) => ({ ...x, archived: false }));
              setEmailArchived(e.id, false)
                .then(() => toast.success("Moved back to Inbox"))
                .catch(() => {
                  patch(e.id, (x) => ({ ...x, archived: true }));
                  toast.error("Couldn't undo. Please try again.");
                });
            },
          },
        });
      } catch {
        patch(e.id, (x) => ({ ...x, archived: false }));
        toast.error("Couldn't archive the email. Please try again.");
      }
    },
    [patch],
  );

  const extract = useCallback(
    async (e: Email) => {
      setExtracting((s) => new Set(s).add(e.id));
      try {
        const opp = await extractOpportunity(e.id);
        if (!opp) {
          toast.info("No opportunity found in this email", {
            description: "Oppora extracts internships, jobs, hackathons, scholarships and events.",
          });
          return;
        }
        onExtracted(opp);
        patch(e.id, (x) => ({ ...x, opportunityId: opp.id, read: true }));
        toast.success("Opportunity extracted", {
          description: opp.title,
          action: { label: "View", onClick: () => router.push(`/opportunities/${opp.id}`) },
        });
      } catch {
        toast.error("Oppora AI couldn't analyze this email. Please try again.");
      } finally {
        setExtracting((s) => {
          const n = new Set(s);
          n.delete(e.id);
          return n;
        });
      }
    },
    [patch, onExtracted, router],
  );

  return { open, toggleRead, toggleSave, archive, extract, extracting };
}
