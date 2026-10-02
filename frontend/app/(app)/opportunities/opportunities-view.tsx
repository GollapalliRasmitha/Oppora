"use client";

import { useSearchParams } from "next/navigation";
import { ScanSearch, SearchX } from "lucide-react";
import { useCallback, useMemo } from "react";
import { OpportunityCard, OpportunityCardSkeleton } from "@/components/oppora/opportunity-card";
import { PageHeader } from "@/components/oppora/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { GlassCard } from "@/components/ui/glass-card";
import { SearchBar } from "@/components/ui/search-bar";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { listOpportunities, startSync } from "@/lib/api";
import {
  FILTER_TYPES,
  SORTS,
  SORT_LABELS,
  filterByType,
  parseSort,
  parseTypeFilter,
  searchOpportunities,
  sortOpportunities,
  typeCounts,
  type SortKey,
  type TypeFilter,
} from "@/lib/domain/opportunities";
import type { Opportunity } from "@/lib/domain/types";
import { useNow } from "@/lib/hooks/use-now";
import { useOpportunityActions } from "@/lib/hooks/use-opportunity-actions";
import { useResource } from "@/lib/hooks/use-resource";

/** Search, filter and sort live in the URL so they survive reloads and back/forward. */
function useListParams() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const type = parseTypeFilter(params.get("type"));
  const sort = parseSort(params.get("sort"));

  const set = useCallback(
    (patch: Partial<{ q: string; type: TypeFilter; sort: SortKey }>) => {
      const next = new URLSearchParams(params.toString());
      const apply = (key: string, value: string | undefined, fallback: string) => {
        if (value === undefined) return;
        if (value && value !== fallback) next.set(key, value);
        else next.delete(key);
      };
      apply("q", patch.q, "");
      apply("type", patch.type, "All");
      apply("sort", patch.sort, "relevance");
      const qs = next.toString();
      // Native history updates are synced into useSearchParams by Next.js without a navigation.
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    },
    [params],
  );

  return { q, type, sort, set };
}

export function OpportunitiesView() {
  const now = useNow();
  const { q, type, sort, set } = useListParams();
  const res = useResource(listOpportunities);
  const { mutate } = res;

  const update = useCallback(
    (id: string, fn: (o: Opportunity) => Opportunity) => mutate((list) => list.map((o) => (o.id === id ? fn(o) : o))),
    [mutate],
  );
  const { toggleSave } = useOpportunityActions({ update });

  const view = useMemo(() => {
    if (res.status !== "success" || !now) return null;
    const searched = searchOpportunities(res.data, q);
    return {
      total: res.data.length,
      counts: typeCounts(searched),
      items: sortOpportunities(filterByType(searched, type), sort, now),
    };
  }, [res.status, res.data, q, type, sort, now]);

  const clearFilters = () => set({ q: "", type: "All" });

  return (
    <>
      <PageHeader title="Opportunities" subtitle="All the opportunities found from your Gmail, sorted by relevance." />

      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchBar
            value={q}
            onValueChange={(v) => set({ q: v })}
            label="Search opportunities"
            placeholder="Search opportunities…"
            className="sm:max-w-md"
          />
          <Select<SortKey>
            label="Sort opportunities"
            prefix="Sort:"
            value={sort}
            onValueChange={(v) => set({ sort: v })}
            options={SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
            className="sm:ml-auto"
          />
        </div>
        <FilterChips<TypeFilter>
          label="Filter by type"
          value={type}
          onValueChange={(v) => set({ type: v })}
          options={(["All", ...FILTER_TYPES] as TypeFilter[]).map((t) => ({
            value: t,
            label: t,
            count: view?.counts[t],
          }))}
        />
      </div>

      {(res.status === "loading" || (res.status === "success" && !view)) && (
        <div aria-busy="true" aria-label="Loading opportunities" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <OpportunityCardSkeleton key={i} />
          ))}
        </div>
      )}

      {res.status === "error" && (
        <GlassCard>
          <ErrorState title="Couldn't load opportunities" description={res.error.message} onRetry={res.reload} />
        </GlassCard>
      )}

      {view && view.total === 0 && (
        <GlassCard>
          <EmptyState
            icon={ScanSearch}
            title="Oppora hasn't discovered any opportunities yet."
            description="Scan your Gmail and Oppora AI will find internships, hackathons, jobs and scholarships for you."
            action={
              <Button
                onClick={() =>
                  startSync()
                    .then(() => toast.info("Oppora AI is analyzing your Gmail…", { description: "Finding opportunities relevant to you." }))
                    .catch(() => toast.error("Couldn't start the scan. Please try again."))
                }
              >
                <ScanSearch aria-hidden />
                Scan Gmail
              </Button>
            }
          />
        </GlassCard>
      )}

      {view && view.total > 0 && (
        <>
          <p aria-live="polite" className="mb-3 text-meta font-medium text-ink-3">
            {view.items.length} {view.items.length === 1 ? "opportunity" : "opportunities"}
            {q && <> matching “{q}”</>}
            {type !== "All" && <> · {type}</>}
          </p>
          {view.items.length === 0 ? (
            <GlassCard>
              <EmptyState
                icon={SearchX}
                title={q ? `No opportunities match “${q}”` : `No ${type.toLowerCase()} opportunities yet`}
                description="Try a different keyword or clear the filters to see everything Oppora found."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            </GlassCard>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {view.items.map((o) => (
                <li key={o.id} className="min-w-0">
                  <OpportunityCard opp={o} now={now!} onToggleSave={toggleSave} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
