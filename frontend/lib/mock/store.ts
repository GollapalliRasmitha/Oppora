/**
 * In-memory mock database. Services in lib/api read and write this until
 * Stage 7 swaps them for real API calls. Resets on full page reload, and is
 * seeded relative to the current date.
 */
import { now } from "@/lib/clock";
import type { SyncStatus } from "@/lib/domain/types";
import { createSeed } from "./seed";

const seed = createSeed(now());

export const db = {
  user: seed.user,
  opportunities: seed.opportunities,
  emails: seed.emails,
  interviews: seed.interviews,
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
