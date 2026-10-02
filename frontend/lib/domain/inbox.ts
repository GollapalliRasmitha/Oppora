import { daysLeft } from "./dates";
import { SOON_WINDOW_DAYS } from "./stats";
import type { Email, EmailCategory, Opportunity, OpportunityType } from "./types";

export const OPPORTUNITY_CATEGORIES: readonly OpportunityType[] = [
  "Internship",
  "Job",
  "Hackathon",
  "Scholarship",
  "Competition",
  "Fellowship",
  "Event",
];

export const INBOX_FILTERS = ["All", "Opportunities", "Deadlines", "Other"] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const isOpportunityCategory = (c: EmailCategory): c is OpportunityType =>
  (OPPORTUNITY_CATEGORIES as readonly string[]).includes(c);

/**
 * "Deadlines" = emails about an opportunity whose deadline falls in the next
 * 7 days (the same window as the dashboard's "Deadlines this week").
 */
export function isDeadlineEmail(e: Email, oppById: Map<string, Opportunity>, now: Date): boolean {
  const opp = e.opportunityId ? oppById.get(e.opportunityId) : undefined;
  if (!opp) return false;
  const d = daysLeft(opp.deadline, now);
  return d !== null && d >= 0 && d <= SOON_WINDOW_DAYS;
}

export function matchesInboxFilter(e: Email, f: InboxFilter, oppById: Map<string, Opportunity>, now: Date): boolean {
  switch (f) {
    case "All":
      return true;
    case "Opportunities":
      return isOpportunityCategory(e.category);
    case "Deadlines":
      return isDeadlineEmail(e, oppById, now);
    case "Other":
      return !isOpportunityCategory(e.category);
  }
}

export function searchEmails(emails: Email[], query: string): Email[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return emails;
  return emails.filter((e) => {
    const hay = `${e.sender} ${e.senderEmail} ${e.subject} ${e.snippet} ${e.category}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

export interface InboxView {
  items: Email[];
  counts: Record<InboxFilter, number>;
  unread: number;
}

/** Visible (non-archived) emails, newest first, with chip counts for the current search. */
export function buildInbox(emails: Email[], opps: Opportunity[], query: string, filter: InboxFilter, now: Date): InboxView {
  const oppById = new Map(opps.map((o) => [o.id, o]));
  const visible = emails
    .filter((e) => !e.archived)
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  const searched = searchEmails(visible, query);
  const counts = Object.fromEntries(
    INBOX_FILTERS.map((f) => [f, searched.filter((e) => matchesInboxFilter(e, f, oppById, now)).length]),
  ) as Record<InboxFilter, number>;
  return {
    items: searched.filter((e) => matchesInboxFilter(e, filter, oppById, now)),
    counts,
    unread: visible.filter((e) => !e.read).length,
  };
}

export function parseInboxFilter(v: string | null): InboxFilter {
  return (INBOX_FILTERS as readonly string[]).includes(v ?? "") ? (v as InboxFilter) : "All";
}
