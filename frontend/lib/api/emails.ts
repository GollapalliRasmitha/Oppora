import type { Email } from "@/lib/domain/types";
import { db } from "@/lib/mock/store";
import { mock } from "./client";

/** Stage 7: GET /api/emails/?opportunity=<id> — newest first. */
export function listEmailsForOpportunity(opportunityId: string): Promise<Email[]> {
  return mock(() =>
    structuredClone(
      db.emails
        .filter((e) => e.opportunityId === opportunityId)
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()),
    ),
  );
}
