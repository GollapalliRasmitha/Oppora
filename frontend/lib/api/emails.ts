import { explainMatch } from "@/lib/domain/match";
import { isOpportunityCategory } from "@/lib/domain/inbox";
import type { Email, Opportunity, Priority } from "@/lib/domain/types";
import { db } from "@/lib/mock/store";
import { ApiError, isEmptyMode, mock } from "./client";

const newestFirst = (a: Email, b: Email) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();

function find(id: string): Email {
  const e = db.emails.find((x) => x.id === id);
  if (!e) throw new ApiError("This email no longer exists.", "not_found");
  return e;
}

/** Stage 7: GET /api/emails/ (archived emails included; the UI filters). */
export function listEmails(): Promise<Email[]> {
  return mock(() => (isEmptyMode() ? [] : structuredClone([...db.emails].sort(newestFirst))));
}

/** Stage 7: GET /api/emails/?opportunity=<id> — newest first. */
export function listEmailsForOpportunity(opportunityId: string): Promise<Email[]> {
  return mock(() => structuredClone(db.emails.filter((e) => e.opportunityId === opportunityId).sort(newestFirst)));
}

export function setEmailRead(id: string, read: boolean): Promise<void> {
  return mock(() => {
    find(id).read = read;
  }, 150);
}

export function setEmailSaved(id: string, saved: boolean): Promise<void> {
  return mock(() => {
    find(id).saved = saved;
  }, 150);
}

export function setEmailArchived(id: string, archived: boolean): Promise<void> {
  return mock(() => {
    find(id).archived = archived;
  }, 150);
}

const SUBJECT_PREFIX = /^(invitation|reminder|new role for you|fwd?|re)\s*:\s*/i;

function priorityFor(relevance: number): Priority {
  return relevance >= 85 ? "High" : relevance >= 70 ? "Medium" : "Low";
}

/**
 * Stage 8: POST /api/emails/<id>/extract/ runs the AI extractor.
 * The mock only uses what the email itself contains — everything else is
 * null — and returns `null` when the email isn't an opportunity.
 */
export function extractOpportunity(emailId: string): Promise<Opportunity | null> {
  return mock(() => {
    const email = find(emailId);
    if (email.opportunityId) return structuredClone(db.opportunities.find((o) => o.id === email.opportunityId) ?? null);
    if (!isOpportunityCategory(email.category)) return null;

    const base = {
      title: email.subject.replace(SUBJECT_PREFIX, "").trim(),
      type: email.category,
      skills: [] as string[],
      eligibility: null,
    };
    const opp: Opportunity = {
      id: `opp_from_${email.id}`,
      organization: email.sender,
      deadline: null,
      priority: priorityFor(email.relevance),
      matchScore: email.relevance,
      discoveredAt: new Date().toISOString(),
      summary: email.snippet,
      location: null,
      duration: null,
      requirements: [],
      benefits: [],
      applicationLink: null,
      matchReasons: explainMatch(base, db.user),
      sourceEmailIds: [email.id],
      saved: false,
      application: null,
      reminderSet: false,
      dismissed: false,
      ...base,
    };
    db.opportunities.push(opp);
    email.opportunityId = opp.id;
    return structuredClone(opp);
  }, 1200);
}
