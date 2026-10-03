import { explainMatch } from "@/lib/domain/match";
import type { GmailConnection, Preferences, User } from "@/lib/domain/types";
import { db } from "@/lib/mock/store";
import { mock } from "./client";

export interface Settings {
  user: User;
  preferences: Preferences;
  gmail: GmailConnection;
}

/** Stage 7: GET /api/preferences/ + /api/auth/me/ + /api/auth/gmail/status/ */
export function getSettings(): Promise<Settings> {
  return mock(() => structuredClone({ user: db.user, preferences: db.preferences, gmail: db.gmail }));
}

type PrefPatch = Partial<Omit<Preferences, "notifications" | "ai">> & {
  notifications?: Partial<Preferences["notifications"]>;
  ai?: Partial<Preferences["ai"]>;
};

/** Stage 7: PATCH /api/preferences/ */
export function updatePreferences(patch: PrefPatch): Promise<Preferences> {
  return mock(() => {
    db.preferences = {
      ...db.preferences,
      ...patch,
      notifications: { ...db.preferences.notifications, ...patch.notifications },
      ai: { ...db.preferences.ai, ...patch.ai },
    };
    return structuredClone(db.preferences);
  }, 200);
}

export type ProfilePatch = Partial<Pick<User, "name" | "interests" | "skills" | "experienceLevel">>;

/**
 * Stage 7: PATCH /api/auth/me/. Changing interests, skills or level
 * re-explains every match so the AI Summary stays truthful.
 */
export function updateProfile(patch: ProfilePatch): Promise<User> {
  return mock(() => {
    db.user = { ...db.user, ...patch };
    for (const o of db.opportunities) o.matchReasons = explainMatch(o, db.user);
    return structuredClone(db.user);
  }, 300);
}

/** Stage 8: starts Google OAuth. The mock just reconnects. */
export function connectGmail(): Promise<GmailConnection> {
  return mock(() => {
    db.gmail = { ...db.gmail, email: db.user.email, status: "connected", connectedAt: new Date().toISOString() };
    return structuredClone(db.gmail);
  }, 600);
}

/** Stage 8: POST /api/auth/gmail/disconnect/ — revokes the token and deletes stored tokens. */
export function disconnectGmail(): Promise<GmailConnection> {
  return mock(() => {
    db.gmail = { ...db.gmail, status: "disconnected", connectedAt: null };
    return structuredClone(db.gmail);
  }, 500);
}

/**
 * Stage 7: DELETE /api/auth/me/data/ — deletes every opportunity, email,
 * interview and notification Oppora stored, and disconnects Gmail.
 * The account itself (name, sign-in) remains.
 */
export function deleteMyData(): Promise<void> {
  return mock(() => {
    db.opportunities.length = 0;
    db.emails.length = 0;
    db.interviews.length = 0;
    db.readNotificationIds.clear();
    db.clearedNotificationIds.clear();
    db.gmail = { ...db.gmail, status: "disconnected", connectedAt: null };
    db.sync = { phase: "idle", emailsInBatch: 0, lastSyncedAt: null };
  }, 800);
}
