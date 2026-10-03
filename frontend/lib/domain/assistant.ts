/**
 * Oppora AI contract. Answers are built by the server
 * (backend/core/domain/assistant.py) only from the user's own stored
 * opportunities, emails and interviews; each links to what it mentions and
 * says so plainly when the data doesn't contain the answer.
 */

export const SUGGESTED_PROMPTS = [
  "Find internships for me",
  "What deadlines are approaching?",
  "Show high-priority opportunities",
  "Why is this opportunity relevant?",
  "What should I apply for this week?",
] as const;

export interface AssistantLink {
  href: string;
  title: string;
  subtitle: string;
}

export interface AssistantAnswer {
  text: string;
  /** Opportunities or emails the answer is based on. */
  links: AssistantLink[];
  /** Optional follow-up prompts (e.g. to pick an opportunity). */
  followUps: string[];
}

export interface AssistantContext {
  /** Set when the assistant is opened from an opportunity's page. */
  opportunityId?: string | null;
}
