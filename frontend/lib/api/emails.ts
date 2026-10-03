import type { Email, Opportunity } from "@/lib/domain/types";
import { listAll, request } from "./client";

const url = (id: string) => `/emails/${encodeURIComponent(id)}`;

/** GET /api/emails/ — newest first, archived included (the UI filters). */
export function listEmails(): Promise<Email[]> {
  return listAll<Email>("/emails");
}

/** GET /api/emails/?opportunity=<id> — newest first. */
export function listEmailsForOpportunity(opportunityId: string): Promise<Email[]> {
  return listAll<Email>("/emails", { opportunity: opportunityId });
}

export async function setEmailRead(id: string, read: boolean): Promise<void> {
  await request(url(id), { method: "PATCH", body: { read } });
}

/** POST /api/saved/ or DELETE /api/saved/?emailId= */
export async function setEmailSaved(id: string, saved: boolean): Promise<void> {
  if (saved) await request("/saved", { method: "POST", body: { emailId: id } });
  else await request("/saved", { method: "DELETE", query: { emailId: id } });
}

export async function setEmailArchived(id: string, archived: boolean): Promise<void> {
  await request(url(id), { method: "PATCH", body: { archived } });
}

/**
 * POST /api/emails/<id>/extract/ — `null` when the email isn't an opportunity.
 * Stage 8 runs the AI extractor behind the same endpoint.
 */
export async function extractOpportunity(emailId: string): Promise<Opportunity | null> {
  const res = await request<{ opportunity: Opportunity | null }>(`${url(emailId)}/extract`, { method: "POST" });
  return res.opportunity;
}
