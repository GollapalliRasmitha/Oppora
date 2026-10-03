/**
 * Shared helpers for the typed service layer. Components never call `fetch`;
 * they call functions in lib/api/*. Until Stage 7 those resolve mock data.
 *
 * Dev-only switches (append to the page URL) to preview UI states:
 *   ?mock=error  → every service call rejects
 *   ?mock=empty  → list endpoints return no data
 *   ?mock=slow   → 2.5s latency to inspect skeletons
 *   ?mock=gmail  → Gmail access has expired: Gmail-backed calls fail with the
 *                  Gmail-access error; account, preferences and sync status
 *                  still load and show "Needs reconnect"
 */
import { db } from "@/lib/mock/store";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: "network" | "gmail" | "ai" | "auth" | "not_found" = "network",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type MockMode = "normal" | "error" | "empty" | "slow" | "gmail";

export function mockMode(): MockMode {
  if (typeof window === "undefined") return "normal";
  const m = new URLSearchParams(window.location.search).get("mock");
  return m === "error" || m === "empty" || m === "slow" || m === "gmail" ? m : "normal";
}

export const GMAIL_ERROR = "We couldn't access your Gmail. Reconnect your account to continue.";

let gmailExpired = false;
/** ?mock=gmail: flip the stored connection to "needs reconnect" once, so Reconnect still works. */
function expireGmail() {
  if (gmailExpired) return;
  gmailExpired = true;
  if (db.gmail.status === "connected") {
    db.gmail = { ...db.gmail, status: "needs_reconnect" };
    db.sync = { ...db.sync, phase: "error" };
  }
}

/**
 * Simulates network latency and the dev error switch. `gmail: false` marks
 * endpoints that don't read Gmail data (account, preferences, sync status).
 */
export async function mock<T>(produce: () => T, latency = 350, { gmail = true }: { gmail?: boolean } = {}): Promise<T> {
  const mode = mockMode();
  await new Promise((r) => setTimeout(r, mode === "slow" ? 2500 : latency));
  if (mode === "gmail") {
    expireGmail();
    if (gmail) throw new ApiError(GMAIL_ERROR, "gmail");
  }
  if (mode === "error") {
    throw new ApiError("We couldn't reach Oppora. Check your connection and try again.", "network");
  }
  return produce();
}

export const isEmptyMode = () => mockMode() === "empty";
