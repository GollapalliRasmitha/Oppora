import { now } from "@/lib/clock";
import { recentEmailCount } from "@/lib/domain/stats";
import type { SyncStatus } from "@/lib/domain/types";
import { db } from "@/lib/mock/store";
import { ApiError, GMAIL_ERROR, mock } from "./client";

/** Stage 9: GET /api/sync/ (polled by the UI). */
export function getSyncStatus(): Promise<SyncStatus> {
  return mock(() => ({ ...db.sync }), 120, { gmail: false });
}

/**
 * Stage 9: POST /api/sync/. The mock walks through the same phases the real
 * Celery job will report: scanning → analyzing N emails → completed.
 */
export function startSync(): Promise<SyncStatus> {
  return mock(() => {
    if (db.gmail.status !== "connected") {
      throw new ApiError(GMAIL_ERROR, "gmail");
    }
    if (db.sync.phase === "scanning" || db.sync.phase === "analyzing") return { ...db.sync };
    db.sync = { ...db.sync, phase: "scanning", emailsInBatch: 0 };
    setTimeout(() => {
      db.sync = { ...db.sync, phase: "analyzing", emailsInBatch: recentEmailCount(db.emails, now()) };
    }, 1400);
    setTimeout(() => {
      db.sync = { ...db.sync, phase: "completed", lastSyncedAt: new Date().toISOString() };
    }, 3600);
    return { ...db.sync };
  }, 150, { gmail: false });
}
