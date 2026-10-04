import type { Digest } from "@/lib/domain/types";
import { request } from "./client";

const EMPTY: Digest = {
  weekOf: "",
  weekLabel: "",
  newThisWeek: [],
  topMatches: [],
  deadlinesSoon: [],
  feeWarnings: [],
  progress: { applied: 0, inProgress: 0, saved: 0, total: 0, appliedPercent: 0 },
};

/** GET /api/digest/ — this week's digest, computed from the user's data. */
export function getDigest(): Promise<Digest> {
  return request<Digest>("/digest", { empty: () => EMPTY });
}
