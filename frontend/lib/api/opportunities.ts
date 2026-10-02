import type { Opportunity } from "@/lib/domain/types";
import { db } from "@/lib/mock/store";
import { ApiError, isEmptyMode, mock } from "./client";

const clone = <T,>(v: T): T => structuredClone(v);

function find(id: string): Opportunity {
  const opp = db.opportunities.find((o) => o.id === id);
  if (!opp) throw new ApiError("This opportunity no longer exists.", "not_found");
  return opp;
}

export function listOpportunities(): Promise<Opportunity[]> {
  return mock(() => (isEmptyMode() ? [] : clone(db.opportunities.filter((o) => !o.dismissed))));
}

export function getOpportunity(id: string): Promise<Opportunity> {
  return mock(() => clone(find(id)));
}

export function setSaved(id: string, saved: boolean): Promise<Opportunity> {
  return mock(() => {
    find(id).saved = saved;
    return clone(find(id));
  }, 200);
}

export function markApplied(id: string): Promise<Opportunity> {
  return mock(() => {
    const opp = find(id);
    const ts = new Date().toISOString();
    opp.application = { status: "applied", startedAt: opp.application?.startedAt ?? ts, appliedAt: ts };
    return clone(opp);
  }, 200);
}

export function setReminder(id: string, on: boolean): Promise<Opportunity> {
  return mock(() => {
    find(id).reminderSet = on;
    return clone(find(id));
  }, 200);
}

/** "Not interested" — hides the opportunity everywhere. Reversible via restore. */
export function dismissOpportunity(id: string): Promise<void> {
  return mock(() => {
    find(id).dismissed = true;
  }, 200);
}

export function restoreOpportunity(id: string): Promise<void> {
  return mock(() => {
    find(id).dismissed = false;
  }, 200);
}
