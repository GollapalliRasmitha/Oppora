"use client";

import { CalendarPlus, CalendarX2, ChevronLeft, ChevronRight, ScanSearch } from "lucide-react";
import { useMemo } from "react";
import { CalendarEvent, CalendarLegend } from "@/components/oppora/calendar-event";
import { MonthCalendar } from "@/components/oppora/month-calendar";
import { LoadError } from "@/components/oppora/load-error";
import { PageHeader } from "@/components/oppora/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard } from "@/components/ui/glass-card";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterChips } from "@/components/ui/filter-chips";
import { listCalendarItems } from "@/lib/api";
import {
  CALENDAR_VIEWS,
  itemsByDay,
  parseDateParam,
  parseView,
  shiftDate,
  weekOf,
  type CalendarView as View,
} from "@/lib/domain/calendar";
import { parseISODate } from "@/lib/domain/dates";
import { toISODate } from "@/lib/domain/deadlines";
import type { CalendarItem, ISODate } from "@/lib/domain/types";
import { useNow } from "@/lib/hooks/use-now";
import { useResource } from "@/lib/hooks/use-resource";
import { useScanGmail } from "@/lib/hooks/use-scan-gmail";
import { useUrlParams } from "@/lib/hooks/use-url-params";
import { cn } from "@/lib/utils";

const VIEW_LABEL: Record<View, string> = { month: "Month", week: "Week", day: "Day" };
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const longFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const dmFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const wdFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short" });

function titleFor(view: View, iso: ISODate) {
  const d = parseISODate(iso);
  if (view === "month") return monthFmt.format(d);
  if (view === "day") return longFmt.format(d);
  const days = weekOf(iso);
  return `${dmFmt.format(parseISODate(days[0]))} – ${dmFmt.format(parseISODate(days[6]))} ${parseISODate(days[6]).getFullYear()}`;
}

const DEFAULTS = { view: "month", date: "" };

/** Suspense fallback (before the URL params are readable). */
export function CalendarFallback() {
  return (
    <>
      <PageHeader title="Calendar" subtitle="Deadlines, interviews and reminders in one place." />
      <CalendarSkeleton />
    </>
  );
}

export function CalendarView() {
  const scanGmail = useScanGmail();
  const now = useNow();
  const res = useResource(() => listCalendarItems());
  const [params, setParams] = useUrlParams(DEFAULTS);

  const today = now ? toISODate(now) : null;
  const view = parseView(params.view);
  const date = today ? parseDateParam(params.date || null, today) : null;
  const byDay = useMemo(() => (res.status === "success" ? itemsByDay(res.data) : new Map<ISODate, CalendarItem[]>()), [res.status, res.data]);

  const setDate = (iso: ISODate) => setParams({ date: iso === today ? "" : iso });

  return (
    <>
      <PageHeader title="Calendar" subtitle="Deadlines, interviews and reminders in one place." />

      {res.status === "error" && (
        <GlassCard>
          <LoadError title="Couldn't load your calendar" error={res.error} onRetry={res.reload} />
        </GlassCard>
      )}

      {res.status !== "error" && (res.status === "loading" || !now || !date) && <CalendarSkeleton />}

      {res.status === "success" && now && date && today && (
        <GlassCard className="min-w-0 p-3 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2">
              <h2 id="cal-title" aria-live="polite" className="mr-auto text-lg font-bold text-ink">
                {titleFor(view, date)}
              </h2>
              <div className="flex items-center">
                {date !== today && (
                  <Button size="sm" variant="ghost" onClick={() => setDate(today)}>
                    Today
                  </Button>
                )}
                <IconButton label={`Previous ${view}`} icon={<ChevronLeft aria-hidden />} onClick={() => setDate(shiftDate(date, view, -1))} />
                <IconButton label={`Next ${view}`} icon={<ChevronRight aria-hidden />} onClick={() => setDate(shiftDate(date, view, 1))} />
              </div>
              <FilterChips<View>
                label="Calendar view"
                value={view}
                onValueChange={(v) => setParams({ view: v })}
                options={CALENDAR_VIEWS.map((v) => ({ value: v, label: VIEW_LABEL[v] }))}
                />
            </div>

            {res.data.length === 0 ? (
              <EmptyState
                icon={CalendarPlus}
                title="Nothing on your calendar yet"
                description="Deadlines, interviews and reminders from your opportunities will appear here."
                action={
                  <Button onClick={() => scanGmail()}>
                    <ScanSearch aria-hidden />
                    Scan Gmail
                  </Button>
                }
              />
            ) : (
              <div>
                {view === "month" && (
                  <MonthCalendar
                    showHeader={false}
                    labelledBy="cal-title"
                    colorBy="kind"
                    month={{ year: parseISODate(date).getFullYear(), month: parseISODate(date).getMonth() }}
                    onMonthChange={(m) => setDate(toISODate(new Date(m.year, m.month, 1)))}
                    events={byDay}
                    selected={null}
                    onSelect={(iso) => iso && setParams({ view: "day", date: iso === today ? "" : iso })}
                    now={now}
                  />
                )}
                {view === "week" && (
                  <WeekView days={weekOf(date)} byDay={byDay} now={now} today={today} onOpenDay={(iso) => setParams({ view: "day", date: iso === today ? "" : iso })} />
                )}
                {view === "day" && <DayView items={byDay.get(date) ?? []} now={now} onShowWeek={() => setParams({ view: "week" })} />}
              </div>
            )}
          <CalendarLegend colorBy="kind" />
        </GlassCard>
      )}
    </>
  );
}

function WeekView({
  days,
  byDay,
  now,
  today,
  onOpenDay,
}: {
  days: ISODate[];
  byDay: Map<ISODate, CalendarItem[]>;
  now: Date;
  today: ISODate;
  onOpenDay: (iso: ISODate) => void;
}) {
  return (
    <ol className="space-y-3 md:grid md:grid-cols-7 md:gap-2 md:space-y-0">
      {days.map((iso) => {
        const d = parseISODate(iso);
        const items = byDay.get(iso) ?? [];
        const isToday = iso === today;
        return (
          <li key={iso} className="min-w-0 rounded-md border border-line bg-white/[.025] p-1.5 md:min-h-64 md:p-2">
            <button
              type="button"
              onClick={() => onOpenDay(iso)}
              aria-label={`${longFmt.format(d)}, ${items.length} ${items.length === 1 ? "item" : "items"}. Open day view`}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-sm px-1 text-left focus-ring hover:bg-white/[.05] md:mb-2 md:flex-col md:items-start md:gap-0",
                items.length > 0 && "mb-2",
              )}
            >
              <span className="text-meta font-semibold text-ink-3">{wdFmt.format(d)}</span>
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-sm font-bold text-ink-2",
                  isToday && "bg-brand text-white shadow-[var(--glow-brand)]",
                )}
              >
                {d.getDate()}
              </span>
              {items.length === 0 && <span className="ml-auto text-meta text-ink-3 md:sr-only">Nothing scheduled</span>}
            </button>
            {items.length > 0 && (
              <ul className="@container space-y-1.5">
                {items.map((it) => (
                  <li key={it.id}>
                    <CalendarEvent item={it} now={now} variant="card" colorBy="kind" />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function DayView({ items, now, onShowWeek }: { items: CalendarItem[]; now: Date; onShowWeek: () => void }) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={CalendarX2}
        className="py-8"
        title="Nothing scheduled"
        description="No deadlines, interviews or reminders on this day."
        action={
          <Button variant="secondary" onClick={onShowWeek}>
            View this week
          </Button>
        }
      />
    );
  const allDay = items.filter((i) => !i.start);
  const timed = items.filter((i) => i.start);
  return (
    <div className="@container space-y-5">
      {allDay.length > 0 && (
        <section>
          <h3 className="mb-2 text-meta font-semibold uppercase tracking-wide text-ink-3">All day</h3>
          <ul className="space-y-2">
            {allDay.map((it) => (
              <li key={it.id}>
                <CalendarEvent item={it} now={now} variant="card" colorBy="kind" />
              </li>
            ))}
          </ul>
        </section>
      )}
      {timed.length > 0 && (
        <section>
          <h3 className="mb-2 text-meta font-semibold uppercase tracking-wide text-ink-3">Scheduled</h3>
          <ul className="space-y-2">
            {timed.map((it) => (
              <li key={it.id}>
                <CalendarEvent item={it} now={now} variant="card" colorBy="kind" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <GlassCard aria-busy="true" aria-label="Loading calendar" className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="ml-auto h-9 w-52" />
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 42 }, (_, i) => (
          <Skeleton key={i} className="h-12 lg:h-16" />
        ))}
      </div>
    </GlassCard>
  );
}
