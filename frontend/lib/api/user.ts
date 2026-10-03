import type { User } from "@/lib/domain/types";
import { request } from "./client";

/** GET /api/auth/me/ */
export function getCurrentUser(): Promise<User> {
  return request<User>("/auth/me", { gmail: false });
}

/** POST /api/auth/logout/ — ends the session (Gmail stays connected for the next sign-in). */
export async function signOut(): Promise<void> {
  await request("/auth/logout", { method: "POST", gmail: false });
}
