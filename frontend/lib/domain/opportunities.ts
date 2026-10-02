import { daysLeft } from "./dates";
import type { Opportunity, OpportunityType, Priority } from "./types";

export const FILTER_TYPES = ["Internship", "Hackathon", "Job", "Scholarship"] as const satisfies readonly OpportunityType[];
export type TypeFilter = "All" | (typeof FILTER_TYPES)[number];

export const SORTS = ["relevance", "deadline", "priority"] as const;
export type SortKey = (typeof SORTS)[number];
export const SORT_LABELS: Record<SortKey, string> = { relevance: "Relevance", deadline: "Deadline", priority: "Priority" };

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

/** Case-insensitive match on title, organization, type, location and skills. */
export function searchOpportunities(opps: Opportunity[], query: string): Opportunity[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return opps;
  return opps.filter((o) => {
    const hay = [o.title, o.organization, o.type, o.location ?? "", ...o.skills].join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

export function filterByType(opps: Opportunity[], type: TypeFilter): Opportunity[] {
  return type === "All" ? opps : opps.filter((o) => o.type === type);
}

/** Counts per chip, computed from the (already searched) list. */
export function typeCounts(opps: Opportunity[]): Record<TypeFilter, number> {
  const counts = { All: opps.length } as Record<TypeFilter, number>;
  for (const t of FILTER_TYPES) counts[t] = opps.filter((o) => o.type === t).length;
  return counts;
}

/**
 * Open deadlines first (soonest first), then opportunities without a deadline,
 * then closed ones (most recently closed first).
 */
function deadlineRank(o: Opportunity, now: Date): [number, number] {
  const d = daysLeft(o.deadline, now);
  if (d === null) return [1, 0];
  return d >= 0 ? [0, d] : [2, -d];
}

function compareDeadline(a: Opportunity, b: Opportunity, now: Date): number {
  const [ga, va] = deadlineRank(a, now);
  const [gb, vb] = deadlineRank(b, now);
  return ga - gb || va - vb;
}

export function sortOpportunities(opps: Opportunity[], sort: SortKey, now: Date): Opportunity[] {
  const list = [...opps];
  switch (sort) {
    case "relevance":
      return list.sort((a, b) => b.matchScore - a.matchScore || compareDeadline(a, b, now));
    case "deadline":
      return list.sort((a, b) => compareDeadline(a, b, now) || b.matchScore - a.matchScore);
    case "priority":
      return list.sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || compareDeadline(a, b, now),
      );
  }
}

export function parseTypeFilter(v: string | null): TypeFilter {
  return (FILTER_TYPES as readonly string[]).includes(v ?? "") ? (v as TypeFilter) : "All";
}

export function parseSort(v: string | null): SortKey {
  return (SORTS as readonly string[]).includes(v ?? "") ? (v as SortKey) : "relevance";
}
