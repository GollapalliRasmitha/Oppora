"use client";

import Link from "next/link";
import { CalendarCheck, CalendarX2, ChevronDown, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { DeadlineItem, DeadlineItemSkeleton } from "@/components/oppora/deadline-item";
import { MonthCalendar, type MonthRef } from "@/components/oppora/month-calendar";
import { PageHeader } from "@/components/oppora/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { listOpportunities } from "@/lib/api";
import { parseISODate } from "@/lib/domain/dates";
import { eventsByDay, groupDeadlines } from "@/lib/domain/deadlines";
import type { ISODate, Opportunity } from "@/lib/domain/types";
import { useNow } from "@/lib/hooks/use-now";
import { useOpportunityActions } from "@/lib/hooks/use-opportunity-actions";
import { useResource } from "@/lib/hooks/use-resource";

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

export function DeadlinesView() {
  const now = useNow();
  const res = useResource(listOpportunities);
  const { mutate } = res;
  const update = useCallback(
    (id: string, fn: (o: Opportunity) => Opportunity) => mutate((list) => list.map((o) => (o.id === id ? fn(o) : o))),
    [mutate],
  );
  const { remind, apply } = useOpportunityActions({ update });

  const [month, setMonth] = useState<MonthRef | null>(null);
  const [selected, setSelected] = useState<ISODate | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const shownMonth: MonthRef | null = month ?? (now ? { year: now.getFullYear(), month: now.getMonth() } : null);
  const events = useMemo(() => (res.status === "success" ? eventsByDay(res.data) : new Map()), [res.status, res.data]);
  const groups = useMemo(
    () => (res.status === "success" && now ? groupDeadlines(res.data, now) : null),
    [res.status, res.data, now],
  );

  return (
    <>
      <PageHeader title="Deadlines" subtitle="Stay on top of your important dates." />

      {(res.status === "loading" || !now || !shownMonth) && res.status !== "error" && <DeadlinesSkeleton />}

      {res.status === "error" && (
        <GlassCard>
          <ErrorState title="Couldn't load your deadlines" description={res.error.message} onRetry={res.reload} />
        </GlassCard>
      )}

      {res.status === "success" && now && shownMonth && groups && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <GlassCard className="min-w-0 p-3 sm:p-5">
            <MonthCalendar
              month={shownMonth}
              onMonthChange={setMonth}
              events={events}
              selected={selected}
              onSelect={setSelected}
              now={now}
            />
            <Legend />
          </GlassCard>

          <GlassCard as="section" aria-labelledby="deadline-list-title" className="min-w-0 p-4 sm:p-5">
            {selected ? (
              <SelectedDay
                iso={selected}
                items={events.get(selected) ?? []}
                now={now}
                onClear={() => setSelected(null)}
                onRemind={remind}
                onComplete={apply}
              />
            ) : groups.thisWeek.length + groups.later.length + groups.closed.length === 0 ? (
              <>
                <h2 id="deadline-list-title" className="sr-only">Upcoming deadlines</h2>
                <EmptyState
                  icon={CalendarCheck}
                  title="No deadlines yet"
                  description="When Oppora finds an opportunity with a deadline, it will show up here and on the calendar."
                  action={
                    <Button asChild variant="secondary">
                      <Link href="/opportunities">View opportunities</Link>
                    </Button>
                  }
                />
              </>
            ) : (
              <>
                <h2 id="deadline-list-title" className="mb-3 text-lg font-bold text-ink">Upcoming Deadlines</h2>
                {groups.thisWeek.length + groups.later.length === 0 && (
                  <p className="mb-4 text-sm text-ink-2">No upcoming deadlines — everything Oppora found has closed.</p>
                )}
                <Group title="This week" items={groups.thisWeek} now={now} onRemind={remind} onComplete={apply} />
                <Group title="Later" items={groups.later} now={now} onRemind={remind} onComplete={apply} />
                {groups.closed.length > 0 && (
                  <div className="mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={showClosed}
                      aria-controls="closed-deadlines"
                      onClick={() => setShowClosed((v) => !v)}
                      className="-ml-2"
                    >
                      <ChevronDown aria-hidden className={showClosed ? "rotate-180 transition-transform" : "transition-transform"} />
                      {showClosed ? "Hide" : "Show"} closed ({groups.closed.length})
                    </Button>
                    <div id="closed-deadlines" hidden={!showClosed}>
                      <Group title="Closed" items={groups.closed} now={now} onRemind={remind} onComplete={apply} />
                    </div>
                  </div>
                )}
              </>
            )}
          </GlassCard>
        </div>
      )}
    </>
  );
}

function Group({
  title,
  items,
  now,
  onRemind,
  onComplete,
}: {
  title: string;
  items: Opportunity[];
  now: Date;
  onRemind: (o: Opportunity) => void;
  onComplete: (o: Opportunity) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-meta font-semibold uppercase tracking-wide text-ink-3">
        {title} <span className="font-medium normal-case tracking-normal">({items.length})</span>
      </h3>
      <ul className="space-y-2">
        {items.map((o) => (
          <DeadlineItem key={o.id} opp={o} now={now} onRemind={onRemind} onComplete={onComplete} />
        ))}
      </ul>
    </section>
  );
}

function SelectedDay({
  iso,
  items,
  now,
  onClear,
  onRemind,
  onComplete,
}: {
  iso: ISODate;
  items: Opportunity[];
  now: Date;
  onClear: () => void;
  onRemind: (o: Opportunity) => void;
  onComplete: (o: Opportunity) => void;
}) {
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="deadline-list-title" aria-live="polite" className="text-lg font-bold text-ink">
          Due {dayFmt.format(parseISODate(iso))}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X aria-hidden /> Show all
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={CalendarX2} className="py-6" title="Nothing due on this day" description="Pick another day, or show all upcoming deadlines." />
      ) : (
        <ul className="space-y-2">
          {items.map((o) => (
            <DeadlineItem key={o.id} opp={o} now={now} onRemind={onRemind} onComplete={onComplete} />
          ))}
        </ul>
      )}
    </>
  );
}

function Legend() {
  const items = [
    { cls: "bg-urgent", label: "3 days or less" },
    { cls: "bg-soon", label: "4–10 days" },
    { cls: "bg-later", label: "More than 10 days" },
    { cls: "bg-ink-3", label: "Closed" },
  ];
  return (
    <ul aria-label="Urgency colours" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-meta text-ink-3">
          <span aria-hidden className={`size-2 rounded-full ${i.cls}`} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function DeadlinesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading deadlines" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <GlassCard className="p-5">
        <Skeleton className="mb-4 h-7 w-40" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 42 }, (_, i) => (
            <Skeleton key={i} className="h-12 lg:h-16" />
          ))}
        </div>
      </GlassCard>
      <GlassCard className="p-5">
        <Skeleton className="mb-4 h-6 w-48" />
        <ul className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <DeadlineItemSkeleton key={i} />
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}
