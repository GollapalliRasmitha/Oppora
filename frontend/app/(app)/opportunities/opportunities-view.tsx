"use client";

import { Bookmark, CircleCheck, Hourglass, ScanSearch, SearchX, type LucideIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import { OpportunityCard, OpportunityCardSkeleton } from "@/components/oppora/opportunity-card";
import { LoadError } from "@/components/oppora/load-error";
import { PageHeader } from "@/components/oppora/page-header";
import { PageSearch } from "@/components/oppora/page-search";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import { listOpportunities } from "@/lib/api";
import {
  SORTS,
  SORT_LABELS,
  VIEWS,
  VIEW_LABELS,
  chipTypes,
  filterByType,
  filterByView,
  parseSort,
  parseTypeFilter,
  parseView,
  searchOpportunities,
  sortOpportunities,
  typeCounts,
  type SortKey,
  type TypeFilter,
  type ViewFilter,
} from "@/lib/domain/opportunities";
import type { Opportunity } from "@/lib/domain/types";
import { useNow } from "@/lib/hooks/use-now";
import { useOpportunityActions } from "@/lib/hooks/use-opportunity-actions";
import { useResource } from "@/lib/hooks/use-resource";
import { useScanGmail } from "@/lib/hooks/use-scan-gmail";
import { useUrlParams } from "@/lib/hooks/use-url-params";

const LIST_DEFAULTS = { q: "", type: "All", sort: "relevance", show: "all" };

/** Empty states for the user's own lists (brief §5.13: Saved, Applications). */
const VIEW_EMPTY: Record<Exclude<ViewFilter, "all">, { icon: LucideIcon; title: string; description: string }> = {
  saved: {
    icon: Bookmark,
    title: "No saved opportunities yet",
    description: "Tap Save on any opportunity to keep it here for later.",
  },
  in_progress: {
    icon: Hourglass,
    title: "No applications in progress",
    description: "Opportunities you've started applying for will show up here.",
  },
  applied: {
    icon: CircleCheck,
    title: "No applications yet",
    description: "When you mark an opportunity as applied, it moves here so you can track it.",
  },
};

/** Search, filter and sort live in the URL so they survive reloads and back/forward. */
function useListParams() {
  const [raw, setRaw] = useUrlParams(LIST_DEFAULTS);
  const set = (patch: Partial<{ q: string; type: TypeFilter; sort: SortKey; show: ViewFilter }>) => setRaw(patch);
  return { q: raw.q, type: parseTypeFilter(raw.type), sort: parseSort(raw.sort), show: parseView(raw.show), set };
}

const PAGE = { title: "Opportunities", subtitle: "All the opportunities found from your Gmail, sorted by relevance." };

/** Suspense fallback (before the URL params are readable): same shape as the loading state. */
export function OpportunitiesFallback() {
  return (
    <>
      <PageHeader {...PAGE} />
      <div aria-hidden className="mb-6 space-y-3">
        <Skeleton className="h-11 w-full sm:max-w-md" />
        <Skeleton className="h-11 w-full max-w-sm" />
      </div>
      <div aria-busy="true" aria-label="Loading opportunities" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <OpportunityCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

export function OpportunitiesView() {
  const scanGmail = useScanGmail();
  const now = useNow();
  const { q, type, sort, show, set } = useListParams();
  const res = useResource(listOpportunities);
  const { mutate } = res;

  const update = useCallback(
    (id: string, fn: (o: Opportunity) => Opportunity) => mutate((list) => list.map((o) => (o.id === id ? fn(o) : o))),
    [mutate],
  );
  const remove = useCallback((id: string) => mutate((list) => list.filter((o) => o.id !== id)), [mutate]);
  const reinsert = useCallback((opp: Opportunity) => mutate((list) => (list.some((o) => o.id === opp.id) ? list : [...list, opp])), [mutate]);
  const { toggleSave, apply, remind, dismiss, hideSender } = useOpportunityActions({ update, remove, reinsert, refresh: res.revalidate });
  const cardActions = useMemo(
    () => ({ onToggleSave: toggleSave, onApply: apply, onRemind: remind, onDismiss: dismiss, onHideSender: hideSender }),
    [toggleSave, apply, remind, dismiss, hideSender],
  );

  const view = useMemo(() => {
    if (res.status !== "success" || !now) return null;
    const searched = filterByView(searchOpportunities(res.data, q), show);
    return {
      total: res.data.length,
      counts: typeCounts(searched),
      // From everything the user has (not the search), so chips don't jump around while typing.
      chips: chipTypes(res.data, type),
      items: sortOpportunities(filterByType(searched, type), sort, now),
    };
  }, [res.status, res.data, q, type, sort, show, now]);

  const clearFilters = () => set({ q: "", type: "All", show: "all" });
  const viewEmpty = show !== "all" && !q && type === "All" ? VIEW_EMPTY[show] : null;

  return (
    <>
      <PageHeader {...PAGE} />

      <div className="mb-6 space-y-3 max-sm:contents">
        <div className="flex flex-col gap-3 max-sm:contents sm:flex-row">
          <PageSearch
            value={q}
            onValueChange={(v) => set({ q: v })}
            label="Search opportunities"
            placeholder="Search opportunities…"
            className="sm:w-full sm:max-w-md"
          />
          {/* Mobile: two equal columns from 430px, stacked below so neither dropdown overflows. */}
          <div className="grid grid-cols-1 gap-3 max-sm:mb-3 min-[430px]:grid-cols-2 sm:ml-auto sm:flex">
            <Select<ViewFilter>
              label="Show opportunities"
              prefix="Show:"
              value={show}
              onValueChange={(v) => set({ show: v })}
              options={VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
              className="w-full sm:w-auto"
            />
            <Select<SortKey>
              label="Sort opportunities"
              prefix="Sort:"
              value={sort}
              onValueChange={(v) => set({ sort: v })}
              options={SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
              className="w-full sm:w-auto"
            />
          </div>
        </div>
        <div className="max-sm:mb-6">
          <FilterChips<TypeFilter>
            label="Filter by type"
            value={type}
            onValueChange={(v) => set({ type: v })}
            options={(view?.chips ?? (["All"] as TypeFilter[])).map((t) => ({
              value: t,
              label: t,
              count: view?.counts[t],
            }))}
          />
        </div>
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
          <LoadError title="Couldn't load opportunities" error={res.error} onRetry={res.reload} />
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
                onClick={() => scanGmail()}
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
            {show !== "all" && <> · {VIEW_LABELS[show]}</>}
          </p>
          {view.items.length === 0 && viewEmpty ? (
            <GlassCard>
              <EmptyState
                icon={viewEmpty.icon}
                title={viewEmpty.title}
                description={viewEmpty.description}
                action={<Button onClick={() => set({ show: "all" })}>Browse all opportunities</Button>}
              />
            </GlassCard>
          ) : view.items.length === 0 ? (
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
                  <OpportunityCard opp={o} now={now!} onToggleSave={toggleSave} actions={cardActions} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
