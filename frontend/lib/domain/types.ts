/**
 * Domain types shared by mock data, services and UI.
 * They mirror the future Django models (Stage 7). Any field the AI could not
 * find in an email is `null` and is rendered as "Not mentioned in email".
 */

export type ISODate = string; // "2026-10-05" (date only, local)
export type ISODateTime = string; // "2026-10-01T09:30:00+05:30"

export type OpportunityType =
  | "Internship"
  | "Job"
  | "Hackathon"
  | "Scholarship"
  | "Competition"
  | "Fellowship"
  | "Event";

export type EmailCategory =
  | OpportunityType
  | "College"
  | "Newsletter"
  | "Promotion"
  | "Other";

export type Priority = "High" | "Medium" | "Low";

/** Where the user is with an opportunity. `null` = not started. */
export type ApplicationStatus = "in_progress" | "applied";

export interface Application {
  status: ApplicationStatus;
  startedAt: ISODateTime;
  appliedAt: ISODateTime | null;
}

/** Result of one match check. "unknown" = the email or profile doesn't say. */
export type MatchCheck = "met" | "unmet" | "unknown";

/** Why an opportunity matched — stored with it so the UI can explain. */
export interface MatchReasons {
  skills: MatchCheck;
  interests: MatchCheck;
  experience: MatchCheck;
  matchedSkills: string[];
  matchedInterests: string[];
}

export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  type: OpportunityType;
  deadline: ISODate | null;
  priority: Priority;
  /** 0–100, from the user's interests and preferences. */
  matchScore: number;
  /** When Oppora first found it in Gmail. */
  discoveredAt: ISODateTime;
  summary: string | null;
  location: string | null;
  duration: string | null;
  eligibility: string | null;
  skills: string[];
  /** Empty = not mentioned in the email. */
  requirements: string[];
  benefits: string[];
  applicationLink: string | null;
  matchReasons: MatchReasons;
  sourceEmailIds: string[];
  saved: boolean;
  application: Application | null;
  reminderSet: boolean;
  dismissed: boolean;
}

export interface Email {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  snippet: string;
  receivedAt: ISODateTime;
  category: EmailCategory;
  /** AI relevance to the user's interests, 0–100. */
  relevance: number;
  read: boolean;
  /** Saved (bookmarked) by the user from the Inbox. */
  saved: boolean;
  /** Archived emails are hidden from the Inbox. */
  archived: boolean;
  opportunityId: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  plan: "Free" | "Pro";
  interests: string[];
  skills: string[];
  /** e.g. "Undergraduate student". `null` = not set in the profile. */
  experienceLevel: string | null;
}

export type SyncPhase = "idle" | "scanning" | "analyzing" | "completed" | "error";

export interface SyncStatus {
  phase: SyncPhase;
  emailsInBatch: number;
  lastSyncedAt: ISODateTime | null;
  /** Emails waiting for the AI (its daily limit was reached); processed on a later sync. */
  queued?: number;
}

export interface Notification {
  id: string;
  kind: "new_opportunity" | "deadline" | "ai_recommendation";
  title: string;
  body: string;
  createdAt: ISODateTime;
  read: boolean;
  opportunityId: string | null;
}

/** An interview scheduled from an email (Stage 8 extracts these). */
export interface Interview {
  id: string;
  opportunityId: string;
  title: string;
  start: ISODateTime;
  /** `null` when the email doesn't say how long it lasts. */
  end: ISODateTime | null;
  /** e.g. "Video call". `null` = not mentioned in the email. */
  location: string | null;
  sourceEmailId: string;
}

export type CalendarKind = "application" | "hackathon" | "scholarship" | "interview" | "reminder";

/** Anything shown on a calendar. All-day items have `start === null`. */
export interface CalendarItem {
  id: string;
  kind: CalendarKind;
  title: string;
  /** Local date the item falls on. */
  date: ISODate;
  start: ISODateTime | null;
  end: ISODateTime | null;
  location: string | null;
  opportunityId: string;
  organization: string;
}

export type PersonalizationLevel = "low" | "balanced" | "high";

/** Mirrors the UserPreference model (Stage 7). */
export interface Preferences {
  notifications: {
    email: boolean;
    deadlineReminders: boolean;
    newOpportunities: boolean;
    weeklyDigest: boolean;
  };
  /** Only English is available for now. */
  language: "en";
  /** Opportunity preferences used when ranking new opportunities (Stage 8). */
  minimumMatch: 0 | 50 | 70 | 85;
  preferredLocations: string[];
  ai: {
    recommendations: boolean;
    personalization: PersonalizationLevel;
    /** Opportunity categories Oppora should look for in Gmail. */
    categories: OpportunityType[];
  };
}

export type GmailStatus = "connected" | "needs_reconnect" | "disconnected";

/** Mirrors the GmailConnection model (Stage 8). Never holds tokens on the client. */
export interface GmailConnection {
  email: string | null;
  status: GmailStatus;
  connectedAt: ISODateTime | null;
  /** OAuth scopes granted — read-only Gmail plus basic profile. */
  scopes: string[];
  initialSyncDays: number;
}

export type Urgency = "urgent" | "soon" | "later" | "passed" | "none";
