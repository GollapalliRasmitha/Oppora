"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { parseISODate } from "@/lib/domain/dates";
import { addDays, monthGrid, toISODate } from "@/lib/domain/deadlines";
import type { CalendarItem, ISODate } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { CalendarEvent, type ColorBy } from "./calendar-event";

export type MonthRef = { year: number; month: number };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const sameMonth = (iso: ISODate, m: MonthRef) => {
  const d = parseISODate(iso);
  return d.getFullYear() === m.year && d.getMonth() === m.month;
};

/**
 * Month view with deadlines. Full event chips when the calendar is wide
 * (container ≥ 672px), urgency dots when compact. Keyboard: arrows move by
 * day/week, Home/End to week start/end, PageUp/PageDown by month, Enter/Space
 * selects. Clicking a chip opens the opportunity; clicking a day selects it.
 * `showHeader={false}` lets a page supply its own toolbar (pass `labelledBy`).
 */
export function MonthCalendar({
  month,
  onMonthChange,
  events,
  selected,
  onSelect,
  now,
  colorBy = "urgency",
  showHeader = true,
  labelledBy = "calendar-title",
  className,
}: {
  month: MonthRef;
  onMonthChange: (m: MonthRef) => void;
  events: Map<ISODate, CalendarItem[]>;
  selected: ISODate | null;
  onSelect: (iso: ISODate | null) => void;
  now: Date;
  colorBy?: ColorBy;
  showHeader?: boolean;
  labelledBy?: string;
  className?: string;
}) {
  const today = toISODate(now);
  const days = monthGrid(month.year, month.month);
  const [focused, setFocused] = useState<ISODate | null>(null);
  const shouldFocus = useRef(false);
  const gridRef = useRef<HTMLTableElement>(null);

  // The roving tab stop: focused day if it's in view, else selected, else today, else the 1st.
  const fallback = [selected, today].find((d): d is ISODate => !!d && sameMonth(d, month)) ?? toISODate(new Date(month.year, month.month, 1));
  const active = focused && sameMonth(focused, month) ? focused : fallback;

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`button[data-iso="${active}"]`)?.focus();
  }, [active]);

  const go = (delta: number) => {
    const d = new Date(month.year, month.month + delta, 1);
    onMonthChange({ year: d.getFullYear(), month: d.getMonth() });
  };

  const moveFocus = (iso: ISODate) => {
    const d = parseISODate(iso);
    if (!sameMonth(iso, month)) onMonthChange({ year: d.getFullYear(), month: d.getMonth() });
    shouldFocus.current = true;
    setFocused(iso);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, iso: ISODate) => {
    const d = parseISODate(iso);
    const weekday = (d.getDay() + 6) % 7;
    const map: Record<string, () => ISODate> = {
      ArrowLeft: () => addDays(iso, -1),
      ArrowRight: () => addDays(iso, 1),
      ArrowUp: () => addDays(iso, -7),
      ArrowDown: () => addDays(iso, 7),
      Home: () => addDays(iso, -weekday),
      End: () => addDays(iso, 6 - weekday),
      PageUp: () => toISODate(new Date(d.getFullYear(), d.getMonth() - 1, Math.min(d.getDate(), 28))),
      PageDown: () => toISODate(new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), 28))),
    };
    const next = map[e.key];
    if (!next) return;
    e.preventDefault();
    moveFocus(next());
  };

  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7));
  const isCurrentMonth = sameMonth(today, month);

  return (
    <div className={cn("@container", className)}>
      {showHeader && (
      <div className="mb-3 flex items-center gap-1">
        <h2 id="calendar-title" aria-live="polite" className="mr-auto text-lg font-bold text-ink">
          {monthFmt.format(new Date(month.year, month.month, 1))}
        </h2>
        {!isCurrentMonth && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onMonthChange({ year: now.getFullYear(), month: now.getMonth() });
              setFocused(today);
            }}
          >
            Today
          </Button>
        )}
        <IconButton label="Previous month" icon={<ChevronLeft aria-hidden />} onClick={() => go(-1)} />
        <IconButton label="Next month" icon={<ChevronRight aria-hidden />} onClick={() => go(1)} />
      </div>
      )}

      <table ref={gridRef} role="grid" aria-labelledby={labelledBy} className="w-full table-fixed border-separate border-spacing-1">
        <thead>
          <tr>
            {WEEKDAYS.map((d, i) => (
              <th key={d} scope="col" abbr={WEEKDAYS_LONG[i]} className="pb-1 text-center text-meta font-semibold text-ink-3">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, w) => (
            <tr key={w}>
              {week.map((date) => {
                const iso = toISODate(date);
                const inMonth = date.getMonth() === month.month;
                const dayEvents = events.get(iso) ?? [];
                const isToday = iso === today;
                const isSelected = iso === selected;
                const label = `${dayFmt.format(date)}${
                  dayEvents.length ? `, ${dayEvents.length} ${dayEvents.length > 1 ? "items" : "item"}: ${dayEvents.map((o) => o.title).join(", ")}` : ""
                }`;
                return (
                  <td
                    key={iso}
                    role="gridcell"
                    aria-selected={isSelected}
                    className={cn(
                      "relative h-12 rounded-sm border align-top transition-colors @lg:h-16 @2xl:h-24",
                      inMonth ? "border-line bg-tint/[.025]" : "border-transparent bg-transparent",
                      isSelected && "border-violet/70 bg-purple/15 shadow-[0_0_16px_-6px_var(--glow-purple)]",
                    )}
                  >
                    <button
                      type="button"
                      data-iso={iso}
                      tabIndex={iso === active ? 0 : -1}
                      aria-label={label}
                      aria-pressed={isSelected}
                      aria-current={isToday ? "date" : undefined}
                      onClick={() => {
                        setFocused(iso);
                        onSelect(isSelected ? null : iso);
                      }}
                      onKeyDown={(e) => onKeyDown(e, iso)}
                      className="absolute inset-0 flex flex-col items-center rounded-sm pt-1 focus-ring @2xl:items-start @2xl:pl-2"
                    >
                      <span
                        className={cn(
                          "flex size-7 items-center justify-center rounded-full text-sm font-semibold",
                          inMonth ? "text-ink" : "font-medium text-ink-3",
                          isToday && "bg-brand text-white shadow-[var(--glow-brand)]",
                        )}
                      >
                        {date.getDate()}
                      </span>
                      {/* Compact: dots */}
                      {dayEvents.length > 0 && (
                        <span className="mt-0.5 flex gap-0.5 @lg:mt-1 @lg:gap-1 @2xl:hidden">
                          {dayEvents.slice(0, 3).map((o) => (
                            <CalendarEvent key={o.id} item={o} now={now} variant="dot" colorBy={colorBy} />
                          ))}
                        </span>
                      )}
                    </button>
                    {/* Wide: chips (links sit above the day button) */}
                    {dayEvents.length > 0 && (
                      <div className="pointer-events-none absolute inset-x-1 top-9 hidden space-y-0.5 @2xl:block">
                        {dayEvents.slice(0, 2).map((o) => (
                          <CalendarEvent key={o.id} item={o} now={now} colorBy={colorBy} className="pointer-events-auto" />
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="block px-1 text-[12px] font-semibold text-ink-3">+{dayEvents.length - 2} more</span>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
