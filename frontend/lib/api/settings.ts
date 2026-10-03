import type { GmailConnection, Preferences, User } from "@/lib/domain/types";
import { mockMode, request } from "./client";

const NO_GMAIL = { gmail: false } as const;

export interface Settings {
  user: User;
  preferences: Preferences;
  gmail: GmailConnection;
}

/** GET /api/auth/me/ + /api/preferences/ + /api/auth/gmail/ */
export async function getSettings(): Promise<Settings> {
  const [user, preferences, gmail] = await Promise.all([
    request<User>("/auth/me", NO_GMAIL),
    request<Preferences>("/preferences", NO_GMAIL),
    request<GmailConnection>("/auth/gmail", NO_GMAIL),
  ]);
  // ?mock=gmail previews an expired Gmail connection.
  return { user, preferences, gmail: mockMode() === "gmail" ? { ...gmail, status: "needs_reconnect" } : gmail };
}

type PrefPatch = Partial<Omit<Preferences, "notifications" | "ai">> & {
  notifications?: Partial<Preferences["notifications"]>;
  ai?: Partial<Preferences["ai"]>;
};

/** PATCH /api/preferences/ — nested groups are merged by the server. */
export function updatePreferences(patch: PrefPatch): Promise<Preferences> {
  return request<Preferences>("/preferences", { method: "PATCH", body: patch, ...NO_GMAIL });
}

export type ProfilePatch = Partial<Pick<User, "name" | "interests" | "skills" | "experienceLevel">>;

/** PATCH /api/auth/me/ — interests/skills/level changes re-explain every match on the server. */
export function updateProfile(patch: ProfilePatch): Promise<User> {
  return request<User>("/auth/me", { method: "PATCH", body: patch, ...NO_GMAIL });
}

/** POST /api/auth/gmail/connect/ — Stage 8 turns this into the Google OAuth flow. */
export function connectGmail(): Promise<GmailConnection> {
  return request<GmailConnection>("/auth/gmail/connect", { method: "POST", ...NO_GMAIL });
}

/** POST /api/auth/gmail/disconnect/ — Stage 8 also revokes the token and deletes stored tokens. */
export function disconnectGmail(): Promise<GmailConnection> {
  return request<GmailConnection>("/auth/gmail/disconnect", { method: "POST", ...NO_GMAIL });
}

/**
 * DELETE /api/auth/me/data/ — deletes every opportunity, email, interview and
 * notification Oppora stored, and disconnects Gmail. The account remains.
 */
export async function deleteMyData(): Promise<void> {
  await request("/auth/me/data", { method: "DELETE", ...NO_GMAIL });
}
