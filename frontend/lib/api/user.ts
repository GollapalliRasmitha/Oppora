import type { User } from "@/lib/domain/types";
import { db } from "@/lib/mock/store";
import { mock } from "./client";

/** Stage 7: GET /api/auth/me/ */
export function getCurrentUser(): Promise<User> {
  return mock(() => structuredClone(db.user), 150, { gmail: false });
}
