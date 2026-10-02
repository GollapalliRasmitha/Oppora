"use client";

import Link from "next/link";
import { Building2, CalendarDays, ChartPie, Layers, ScanSearch } from "lucide-react";
import { useState } from "react";
import { AICard } from "@/components/oppora/ai-card";
import { BarChart, DonutChart } from "@/components/oppora/charts";
import { InsightCard, InsightCardSkeleton } from "@/components/oppora/insight-card";
import { PageHeader } from "@/components/oppora/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { getInsights, startSync } from "@/lib/api";
import type { Insights, TrendRange } from "@/lib/domain/insights";
import { useResource } from "@/lib/hooks/use-resource";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function InsightsView() {
  const [range, setRange] = useState<TrendRange>(7);
  // Keyed by range so switching refetches with a fresh loading state.
  return (
    <>
      <PageHeader title="AI Insights" subtitle="Your personalized insights based on Gmail analysis." />
      <InsightsBody key={range} range={range} onRangeChange={setRange} />
    </>
  );
}

function InsightsBody({ range, onRangeChange }: { range: TrendRange; onRangeChange: (r: TrendRange) => void }) {
  const res = useResource(() => getInsights(range));

  if (res.status === "loading") return <InsightsSkeleton />;
  if (res.status === "error")
    return (
      <GlassCard>
        <ErrorState title="Couldn't load your insights" description={res.error.message} onRetry={res.reload} />
      </GlassCard>
    );
  if (res.data.total === 0)
    return (
      <GlassCard>
        <EmptyState
          icon={ChartPie}
          title="No insights yet"
          description="Insights appear once Oppora has found opportunities in your Gmail."
          action={
            <Button
              onClick={() =>
                startSync()
                  .then(() => toast.info("Oppora AI is analyzing your Gmail…", { description: "Finding opportunities relevant to you." }))
                  .catch(() => toast.error("Couldn't start the scan. Please try again."))
              }
            >
              <ScanSearch aria-hidden /> Scan Gmail
            </Button>
          }
        />
      </GlassCard>
    );

  return <InsightsContent data={res.data} range={range} onRangeChange={onRangeChange} />;
}

function InsightsContent({ data, range, onRangeChange }: { data: Insights; range: TrendRange; onRangeChange: (r: TrendRange) => void }) {
  const { mostCommonCategory: cat, topCompany: org, bestDay: day, progress: p } = data;
  return (
    <div className="space-y-6">
      <section aria-label="Highlights" className="grid gap-4 md:grid-cols-3">
        <InsightCard
          icon={Layers}
          label="Most Common Category"
          value={cat ? `${cat.type}s (${cat.percent}%)` : "—"}
          detail={cat ? `${cat.count} of ${data.total} opportunities${cat.tied ? " · tied with another category" : ""}` : "No data yet"}
        />
        <InsightCard
          icon={Building2}
          label="Top Company"
          value={org ? org.name : "—"}
          detail={org ? `${plural(org.count, "opportunity", "opportunities")}${org.tied ? " · tied with others" : ""}` : "No data yet"}
        />
        <InsightCard
          icon={CalendarDays}
          label="Best Day To Apply"
          value={day ? day.weekday : "—"}
          detail={day ? `${plural(day.count, "opportunity", "opportunities")} arrived on ${day.weekday}s${day.tied ? " · tied" : ""}` : "No data yet"}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <GlassCard as="section" aria-labelledby="trend-title" className="min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="trend-title" className="text-lg font-bold text-ink">Opportunity Trends</h2>
              <p className="text-meta text-ink-3">
                {plural(data.trendTotal, "opportunity", "opportunities")} found in the last {range} days
              </p>
            </div>
            <FilterChips<"7" | "30">
              label="Time range"
              value={String(range) as "7" | "30"}
              onValueChange={(v) => onRangeChange(Number(v) as TrendRange)}
              options={[
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
              ]}
              className="pb-0"
            />
          </div>
          <BarChart
            title={`Opportunities found per day, last ${range} days`}
            unit={["opportunity", "opportunities"]}
            data={data.trend.map((t) => ({ key: t.date, label: t.label, fullLabel: t.fullLabel, value: t.count }))}
          />
        </GlassCard>

        <GlassCard as="section" aria-labelledby="progress-title" className="min-w-0 p-5">
          <h2 id="progress-title" className="text-lg font-bold text-ink">Your Application Progress</h2>
          <p className="mb-4 text-meta text-ink-3">Applied out of all {data.total} tracked opportunities</p>
          <DonutChart
            title="Application progress"
            centerValue={`${p.appliedPercent}%`}
            centerLabel="Applied"
            data={[
              { key: "applied", label: "Applied", value: p.applied },
              { key: "in_progress", label: "In Progress", value: p.inProgress },
              { key: "saved", label: "Saved", value: p.saved },
              { key: "other", label: "Other", value: p.other },
            ]}
          />
          <p className="mt-3 text-meta text-ink-3">Saved = saved but not started. Other = not saved and not started.</p>
        </GlassCard>
      </div>

      <AICard
        orb
        actions={
          <Button asChild size="sm">
            <Link href="/opportunities">View Opportunities</Link>
          </Button>
        }
      >
        <p>{data.recommendation}</p>
      </AICard>
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading insights" className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <InsightCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <GlassCard className="p-5">
          <Skeleton className="mb-4 h-6 w-48" />
          <div className="flex h-44 items-end gap-3">
            {[40, 70, 30, 90, 55, 20, 65].map((h, i) => (
              <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
            ))}
          </div>
        </GlassCard>
        <GlassCard className="p-5">
          <Skeleton className="mb-4 h-6 w-56" />
          <div className="flex items-center gap-5">
            <Skeleton className="size-[148px] rounded-full" />
            <div className="flex-1 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-5" />
              ))}
            </div>
          </div>
        </GlassCard>
      </div>
      <GlassCard className="space-y-2 p-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-3/4" />
      </GlassCard>
    </div>
  );
}
