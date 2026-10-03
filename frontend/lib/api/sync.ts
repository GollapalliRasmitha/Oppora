import type { SyncStatus } from "@/lib/domain/types";
import { mockMode, request } from "./client";

/** GET /api/sync/ (polled by the UI). Stage 9 reports the Celery job's real progress. */
export async function getSyncStatus(): Promise<SyncStatus> {
  const s = await request<SyncStatus>("/sync", { gmail: false });
  // ?mock=gmail previews an expired Gmail connection.
  return mockMode() === "gmail" ? { ...s, phase: "error" } : s;
}

/** POST /api/sync/ — fails with the Gmail error (code "gmail") when Gmail isn't connected. */
export function startSync(): Promise<SyncStatus> {
  return request<SyncStatus>("/sync", { method: "POST", gmail: false });
}
