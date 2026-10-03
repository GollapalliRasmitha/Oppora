"use client";

import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarClock,
  CircleCheck,
  Hourglass,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { useCallback } from "react";
import { DeadlineIndicator } from "@/components/oppora/badges";
import { LoadError } from "@/components/oppora/load-error";
import { AICard, RecommendationsOffCard } from "@/components/oppora/ai-card";
import { Monogram } from "@/components/oppora/monogram";
import { OpportunityRow, OpportunityRowSkeleton } from "@/components/oppora/opportunity-row";
import { useShell } from "@/components/oppora/shell-context";
import { StatCard, StatCardSkeleton } from "@/components/oppora/stat-card";
import { SyncStatus } from "@/components/oppora/sync-status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard, type DashboardData } from "@/lib/api";
import { daysLeft, greetingFor } from "@/lib/domain/dates";
import type { Opportunity } from "@/lib/domain/types";
import { useNow } from "@/lib/hooks/use-now";
import { useOpportunityActions } from "@/lib/hooks/use-opportunity-actions";
import { useResource } from "@/lib/hooks/use-resource";
import { useScanGmail } from "@/lib/hooks/use-scan-gmail";

export function DashboardView() {
  const now = useNow();
  const { user, userStatus } = useShell();
  // The name is optional: if the profile fails, greet without it rather than spin forever.
  const greetingReady = now !== null && userStatus !== "loading";
  const dash = useResource(() => getDashboard());
  const { mutate, revalidate } = dash;

  const update = useCallback(
    (id: string, fn: (o: Opportunity) => Opportunity) =>
      mutate((d) => ({ ...d, latest: d.latest.map((o) => (o.id === id ? fn(o) : o)) })),
    [mutate],
  );
  const remove = useCallback(
    (id: string) => mutate((d) => ({ ...d, latest: d.latest.filter((o) => o.id !== id) })),
    [mutate],
  );
  const actions = useOpportunityActions({ update, remove, reinsert: revalidate, onChanged: revalidate, refresh: revalidate });

  return (
    <div className="space-y-6">
      <section aria-labelledby="greeting" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <GlassCard
          strong
          className="relative overflow-hidden bg-[linear-gradient(120deg,rgba(124,58,237,.30),rgba(79,70,229,.16)_45%,rgba(37,99,235,.10))] p-6 sm:p-7"
        >
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-purple/30 blur-3xl" />
          <div className="relative">
            <h1 id="greeting" className="text-2xl font-extrabold tracking-tight text-ink sm:text-[32px]">
              {greetingReady ? (
                <>
                  {greetingFor(now)}
                  {user ? ", " : ""}
                  {/* keeps the sparkle on the same line as the last word */}
                  <span className="whitespace-nowrap">
                    {user?.name ?? ""}!
                    <Sparkles aria-hidden className="ml-2 inline size-6 align-[-2px] text-violet" />
                  </span>
                </>
              ) : (
                <span className="sr-only">Loading your greeting</span>
              )}
            </h1>
            {!greetingReady && <Skeleton className="h-9 w-72 max-w-full" />}
            <p className="mt-2 text-[15px] text-ink-2 sm:text-base">Here&apos;s what&apos;s happening with your opportunities today.</p>
          </div>
        </GlassCard>

        <GlassCard className="flex flex-col justify-center p-5">
          <h2 className="mb-3 text-meta font-semibold uppercase tracking-wide text-ink-3">AI status</h2>
          <SyncStatus />
        </GlassCard>
      </section>

      {dash.status === "loading" && <DashboardSkeleton />}

      {dash.status === "error" && (
        <GlassCard>
          <LoadError title="Couldn't load your dashboard" error={dash.error} onRetry={dash.reload} />
        </GlassCard>
      )}

      {dash.status === "success" && now && <DashboardContent data={dash.data} now={now} actions={actions} />}
    </div>
  );
}

function DashboardContent({
  data,
  now,
  actions,
}: {
  data: DashboardData;
  now: Date;
  actions: ReturnType<typeof useOpportunityActions>;
}) {
  const scanGmail = useScanGmail();
  const { setAssistantOpen } = useShell();
  const { stats, latest, upcoming, recommendation } = data;

  if (stats.total.value === 0) {
    return (
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
    );
  }

  return (
    <>
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={BriefcaseBusiness} accent="purple" value={stats.total.value} label="Total Opportunities" href="/opportunities" trend={stats.total.trendLabel} trendKind={stats.total.trend > 0 ? "up" : "neutral"} />
        <StatCard
          icon={CalendarClock}
          accent="pink"
          value={stats.deadlinesThisWeek.value}
          label="Deadlines This Week"
          href="/deadlines"
          trend={stats.deadlinesThisWeek.trendLabel}
          trendKind={stats.deadlinesThisWeek.urgent > 0 ? "alert" : "neutral"}
        />
        <StatCard icon={CircleCheck} accent="green" value={stats.applied.value} label="Applied" href="/opportunities?show=applied" trend={stats.applied.trendLabel} trendKind={stats.applied.trend > 0 ? "up" : "neutral"} />
        <StatCard icon={Hourglass} accent="blue" value={stats.inProgress.value} label="In Progress" href="/opportunities?show=in_progress" trend={stats.inProgress.trendLabel} trendKind={stats.inProgress.trend > 0 ? "up" : "neutral"} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <GlassCard as="section" aria-labelledby="latest-heading" className="min-w-0 p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-3 px-2">
            <h2 id="latest-heading" className="text-lg font-bold text-ink">Latest Opportunities</h2>
            <Link href="/opportunities" className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-violet focus-ring hover:text-ink">
              View all <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          {latest.length === 0 ? (
            <EmptyState
              icon={BriefcaseBusiness}
              title="No opportunities to show"
              description="You've hidden everything in this list. Hidden items won't come back unless you undo."
              action={
                <Button asChild variant="secondary">
                  <Link href="/opportunities">View all opportunities</Link>
                </Button>
              }
            />
          ) : (
            <ul className="@container divide-y divide-line">
              {latest.map((o) => (
                <OpportunityRow
                  key={o.id}
                  opp={o}
                  now={now}
                  actions={{
                    onToggleSave: actions.toggleSave,
                    onApply: actions.apply,
                    onRemind: actions.remind,
                    onDismiss: actions.dismiss,
                    onHideSender: actions.hideSender,
                  }}
                />
              ))}
            </ul>
          )}
        </GlassCard>

        <div className="grid content-start gap-6 md:grid-cols-2 xl:grid-cols-1">
          <GlassCard as="section" aria-labelledby="upcoming-heading" className="min-w-0 p-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 id="upcoming-heading" className="text-lg font-bold text-ink">Upcoming Deadlines</h2>
              <span className="text-meta font-medium text-ink-3">Next 7 days</span>
            </div>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                className="py-6"
                title="Nothing due this week"
                description="No deadlines in the next 7 days. Enjoy the breathing room."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/deadlines">See all deadlines</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-1">
                {upcoming.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/opportunities/${o.id}`}
                      className="flex items-center gap-3 rounded-md p-2 focus-ring transition-colors hover:bg-white/[.04]"
                    >
                      <Monogram name={o.organization} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{o.title}</span>
                        <span className="block truncate text-meta text-ink-3">{o.organization} · {o.type}</span>
                      </span>
                      <DeadlineIndicator deadline={o.deadline} days={daysLeft(o.deadline, now)} variant="pill" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          {recommendation ? (
            <AICard
              orb
              actions={
                <>
                  <Button asChild size="sm">
                    <Link href="/opportunities">View Opportunities</Link>
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setAssistantOpen(true)}>
                    <Sparkles aria-hidden />
                    Ask AI
                  </Button>
                </>
              }
            >
              <p>{recommendation.message}</p>
            </AICard>
          ) : (
            <RecommendationsOffCard />
          )}
        </div>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your dashboard" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <GlassCard className="p-4 sm:p-5">
          <Skeleton className="mb-4 ml-2 h-6 w-48" />
          <ul className="@container divide-y divide-line">
            {[0, 1, 2, 3, 4].map((i) => (
              <OpportunityRowSkeleton key={i} />
            ))}
          </ul>
        </GlassCard>
        <div className="grid content-start gap-6 md:grid-cols-2 xl:grid-cols-1">
          <GlassCard className="space-y-3 p-5">
            <Skeleton className="h-6 w-44" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </GlassCard>
          <GlassCard className="space-y-3 p-5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
