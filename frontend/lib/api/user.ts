import type { User } from "@/lib/domain/types";
import { request } from "./client";

/** GET /api/auth/me/ */
export function getCurrentUser(): Promise<User> {
  return request<User>("/auth/me", { gmail: false });
}
