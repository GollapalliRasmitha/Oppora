/**
 * In-memory mock database. Services in lib/api read and write this until
 * Stage 7 swaps them for real API calls. Resets on full page reload.
 */
import type { Opportunity, SyncStatus } from "@/lib/domain/types";
import { seedEmails, seedOpportunities, seedUser } from "./seed";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const db = {
  user: clone(seedUser),
  opportunities: clone(seedOpportunities) as Opportunity[],
  emails: clone(seedEmails),
  /** Notification ids the user has read or cleared (notifications are derived). */
  readNotificationIds: new Set<string>(),
  clearedNotificationIds: new Set<string>(),
  sync: {
    phase: "completed",
    emailsInBatch: 0,
    // Mock: the last background sync finished two minutes before the app loaded.
    lastSyncedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  } as SyncStatus,
};
