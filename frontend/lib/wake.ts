/**
 * The free-tier backend (Render) sleeps after 15 minutes without traffic and
 * takes 30-60 s to wake up. While it does, the Vercel proxy answers 502 within
 * a second. Everything that talks to the backend waits for it here instead of
 * failing: `waitForBackend()` polls GET /api/health (no database, no Redis) until
 * it answers, and `WakingNotice` shows "Waking up the server…" meanwhile.
 *
 * Concurrent callers (a page loads several things at once) share one wait.
 */

export type WakeStatus = "idle" | "waking" | "failed";
export type WakeResult = {
  ok: boolean;
  /** The server didn't answer at first: it was asleep, so nothing sent before could have run. */
  wasAsleep: boolean;
};

export const WAKING_MESSAGE = "Waking up the server, this can take up to a minute…";
export const WAKE_FAILED_MESSAGE = "The server is taking too long to wake up. Please try again in a minute.";

/** Waits between health checks (ms); with each check's own time they cover about 90 s. */
const POLL_DELAYS = [2000, 3000, 5000, 8000, 10000, 10000, 15000, 15000, 20000];
const MAX_WAIT_MS = 90_000;
const PING_TIMEOUT_MS = 20_000;
const FAILED_SHOWS_FOR_MS = 8000;

let status: WakeStatus = "idle";
const listeners = new Set<() => void>();
let current: Promise<WakeResult> | null = null;
let failedTimer: ReturnType<typeof setTimeout> | undefined;

function setStatus(next: WakeStatus) {
  if (status === next) return;
  status = next;
  listeners.forEach((l) => l());
}

export function subscribeWake(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function wakeStatus(): WakeStatus {
  return status;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One health check: true when the backend answered 2xx. */
async function ping(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Resolves once the backend answers (or after ~90 s with ok: false). Shows the waking notice while it waits. */
export function waitForBackend(): Promise<WakeResult> {
  current ??= (async (): Promise<WakeResult> => {
    if (await ping()) return { ok: true, wasAsleep: false };
    clearTimeout(failedTimer);
    setStatus("waking");
    const started = Date.now();
    for (const delay of POLL_DELAYS) {
      if (Date.now() - started >= MAX_WAIT_MS) break;
      await sleep(delay);
      if (await ping()) {
        setStatus("idle");
        return { ok: true, wasAsleep: true };
      }
    }
    setStatus("failed");
    failedTimer = setTimeout(() => setStatus("idle"), FAILED_SHOWS_FOR_MS);
    return { ok: false, wasAsleep: true };
  })().finally(() => {
    current = null;
  });
  return current;
}

/** Fire-and-forget: start waking the backend early (the landing page calls it on load). */
export function wakeBackend(): void {
  void ping();
}
