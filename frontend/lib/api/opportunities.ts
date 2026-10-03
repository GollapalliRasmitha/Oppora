import type { HiddenSender, Opportunity } from "@/lib/domain/types";
import { listAll, request } from "./client";

const url = (id: string) => `/opportunities/${encodeURIComponent(id)}`;

/** GET /api/opportunities/ — "Not interested" ones are excluded by the server. */
export function listOpportunities(): Promise<Opportunity[]> {
  return listAll<Opportunity>("/opportunities");
}

export function getOpportunity(id: string): Promise<Opportunity> {
  return request<Opportunity>(url(id));
}

/** POST /api/saved/ or DELETE /api/saved/?opportunityId= */
export async function setSaved(id: string, saved: boolean): Promise<Opportunity> {
  if (saved) await request("/saved", { method: "POST", body: { opportunityId: id } });
  else await request("/saved", { method: "DELETE", query: { opportunityId: id } });
  return getOpportunity(id);
}

/** POST /api/applications/ — idempotent; returns the updated opportunity. */
export async function markApplied(id: string): Promise<Opportunity> {
  const res = await request<{ opportunity: Opportunity }>("/applications", {
    method: "POST",
    body: { opportunityId: id, status: "applied" },
  });
  return res.opportunity;
}

export function setReminder(id: string, on: boolean): Promise<Opportunity> {
  return request<Opportunity>(url(id), { method: "PATCH", body: { reminderSet: on } });
}

/** "Not interested" — hides the opportunity everywhere. Reversible via restore. */
export async function dismissOpportunity(id: string): Promise<void> {
  await request(url(id), { method: "PATCH", body: { dismissed: true } });
}

export async function restoreOpportunity(id: string): Promise<void> {
  await request(url(id), { method: "PATCH", body: { dismissed: false } });
}

/** POST /api/hidden-senders/ — hides every opportunity from this opportunity's sender and skips their future emails. */
export function hideSender(opportunityId: string): Promise<HiddenSender> {
  return request<HiddenSender>("/hidden-senders", { method: "POST", body: { opportunityId } });
}

/** DELETE /api/hidden-senders/<id>/ — "Show again": restores what the rule hid. */
export async function showSender(id: string): Promise<string[]> {
  const res = await request<{ restoredOpportunityIds: string[] }>(`/hidden-senders/${encodeURIComponent(id)}`, { method: "DELETE" });
  return res.restoredOpportunityIds;
}

/** GET /api/hidden-senders/ */
export function listHiddenSenders(): Promise<HiddenSender[]> {
  return request<HiddenSender[]>("/hidden-senders", { empty: () => [], gmail: false });
}
