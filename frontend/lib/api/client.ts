/**
 * Shared helpers for the typed service layer. Components never call `fetch`;
 * they call functions in lib/api/*. Until Stage 7 those resolve mock data.
 *
 * Dev-only switches (append to the page URL) to preview UI states:
 *   ?mock=error  → every service call rejects
 *   ?mock=empty  → list endpoints return no data
 *   ?mock=slow   → 2.5s latency to inspect skeletons
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: "network" | "gmail" | "ai" | "auth" | "not_found" = "network",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type MockMode = "normal" | "error" | "empty" | "slow";

export function mockMode(): MockMode {
  if (typeof window === "undefined") return "normal";
  const m = new URLSearchParams(window.location.search).get("mock");
  return m === "error" || m === "empty" || m === "slow" ? m : "normal";
}

/** Simulates network latency and the dev error switch. */
export async function mock<T>(produce: () => T, latency = 350): Promise<T> {
  const mode = mockMode();
  await new Promise((r) => setTimeout(r, mode === "slow" ? 2500 : latency));
  if (mode === "error") {
    throw new ApiError("We couldn't reach Oppora. Check your connection and try again.", "network");
  }
  return produce();
}

export const isEmptyMode = () => mockMode() === "empty";
