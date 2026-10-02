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
  applicationLink: string | null;
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
  opportunityId: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  plan: "Free" | "Pro";
  interests: string[];
}

export type SyncPhase = "idle" | "scanning" | "analyzing" | "completed" | "error";

export interface SyncStatus {
  phase: SyncPhase;
  emailsInBatch: number;
  lastSyncedAt: ISODateTime | null;
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

export type Urgency = "urgent" | "soon" | "later" | "passed" | "none";
