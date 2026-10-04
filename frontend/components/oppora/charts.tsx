"use client";

import { Table2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Data-viz colours: CSS variables defined per theme in globals.css, each set
 * validated with the dataviz skill's palette checker against its own surface
 * (dark #0F1336, light #FFFFFF). Single-series bars use one hue; the progress
 * donut is an ordered sequence on one violet ramp, its first step the most
 * prominent ("further along"): brightest on dark, darkest on light.
 */
export const VIZ = {
  bar: "var(--viz-bar)",
  barHover: "var(--viz-bar-hover)",
  ordinal: ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)"],
  track: "var(--viz-track)",
} as const;

function niceMax(n: number) {
  if (n <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / step) * step;
}

export type BarDatum = { key: string; label: string; fullLabel: string; value: number };

/** Single-series vertical bars with hover/focus tooltips and a table view. */
export function BarChart({
  data,
  title,
  unit,
  valueHeader = "Count",
  className,
}: {
  data: BarDatum[];
  /** Used for the accessible name and table caption. */
  title: string;
  /** Header of the value column in the table view. */
  valueHeader?: string;
  /** e.g. ["opportunity", "opportunities"] */
  unit: [string, string];
  className?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const ticks = [max, max / 2, 0];
  const few = data.length <= 10;
  const fmt = (v: number) => `${v} ${v === 1 ? unit[0] : unit[1]}`;

  return (
    <div className={className}>
      {showTable ? (
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-left text-meta text-ink-3">
              <th scope="col" className="py-1.5 font-semibold">Day</th>
              <th scope="col" className="py-1.5 text-right font-semibold">{valueHeader}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-medium text-ink-2">{d.fullLabel}</th>
                <td className="py-1.5 text-right font-semibold tabular-nums text-ink">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div role="img" aria-label={`${title}: ${data.map((d) => `${d.fullLabel} ${d.value}`).join(", ")}`} className="flex gap-2">
          {/* y-axis */}
          <div aria-hidden className="flex h-44 flex-col justify-between pb-6 text-right text-micro tabular-nums text-ink-3">
            {ticks.map((t) => (
              <span key={t} className="leading-none">{t}</span>
            ))}
          </div>
          <div className="relative flex-1">
            {/* recessive gridlines */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex h-38 flex-col justify-between">
              {ticks.map((t) => (
                <span key={t} className={cn("block h-px", t === 0 ? "bg-line-strong" : "bg-line")} />
              ))}
            </div>
            <div className="relative flex h-44 items-end gap-0.5">
              {data.map((d, i) => (
                <div
                  key={d.key}
                  tabIndex={0}
                  aria-label={`${d.fullLabel}: ${fmt(d.value)}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="group relative flex h-full flex-1 flex-col justify-end rounded-sm pb-6 outline-none focus-visible:bg-tint/[.04] focus-visible:ring-2 focus-visible:ring-violet"
                >
                  {/* bar: anchored to the baseline, rounded data end */}
                  <div className="mx-auto h-38 w-full max-w-7 self-end">
                    <div className="flex h-full items-end">
                      <div
                        className="w-full rounded-t-[4px] transition-[height,background-color] duration-300"
                        style={{
                          height: `${(d.value / max) * 100}%`,
                          minHeight: d.value > 0 ? 3 : 0,
                          background: active === i ? VIZ.barHover : VIZ.bar,
                        }}
                      />
                    </div>
                  </div>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap text-micro text-ink-3",
                      // Long ranges: every 5th day, counted back from today so the last bar is labelled.
                      !few && (data.length - 1 - i) % 5 !== 0 && "invisible",
                    )}
                  >
                    {d.label}
                  </span>
                  {active === i && (
                    <div
                      role="tooltip"
                      className={cn(
                        "pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-meta shadow-[var(--shadow-pop)]",
                        // Keep the tooltip inside the chart near the edges.
                        i < data.length * 0.2 ? "left-0" : i > data.length * 0.8 ? "right-0" : "left-1/2 -translate-x-1/2",
                      )}
                    >
                      <span className="block text-ink-3">{d.fullLabel}</span>
                      <span className="font-bold text-ink">{fmt(d.value)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <Button variant="ghost" size="sm" className="-ml-2 mt-2" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
        <Table2 aria-hidden />
        {showTable ? "Show chart" : "Show table"}
      </Button>
    </div>
  );
}

export type DonutSlice = { key: string; label: string; value: number };

/**
 * Ordinal donut (stages of one sequence) with a centre value, 2px surface gaps
 * between segments, hover/focus details and a legend that carries labels and
 * values so colour is never the only signal.
 */
export function DonutChart({
  data,
  centerValue,
  centerLabel,
  title,
  size = 148,
}: {
  data: DonutSlice[];
  centerValue: string;
  centerLabel: string;
  title: string;
  size?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  const gap = data.filter((d) => d.value > 0).length > 1 ? 1.2 : 0; // ≈2px at this size
  // Start position of each segment along the ring (cumulative share of the circumference).
  const starts = data.map((_, i) => data.slice(0, i).reduce((sum, d) => sum + (total ? (d.value / total) * c : 0), 0));
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="-rotate-90" role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
          <circle cx="50" cy="50" r={r} fill="none" style={{ stroke: VIZ.track }} strokeWidth="12" />
          {data.map((d, i) => {
            if (!d.value) return null;
            const len = (d.value / total) * c;
            return (
              <circle
                key={d.key}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                style={{ stroke: VIZ.ordinal[i] }}
                strokeWidth={active === d.key ? 14 : 12}
                strokeDasharray={`${Math.max(len - gap, 0.1)} ${c}`}
                strokeDashoffset={-starts[i]}
                className="transition-[stroke-width] duration-200"
                onMouseEnter={() => setActive(d.key)}
                onMouseLeave={() => setActive(null)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {active ? (
            <>
              <span className="text-2xl font-extrabold text-ink">{data.find((d) => d.key === active)!.value}</span>
              <span className="text-meta text-ink-3">{data.find((d) => d.key === active)!.label}</span>
            </>
          ) : (
            <>
              <span className="text-2xl font-extrabold text-ink">{centerValue}</span>
              <span className="text-meta text-ink-3">{centerLabel}</span>
            </>
          )}
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.key}>
            <div
              tabIndex={0}
              onMouseEnter={() => setActive(d.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(d.key)}
              onBlur={() => setActive(null)}
              className={cn(
                "flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet",
                active === d.key && "bg-tint/[.05]",
              )}
            >
              <span aria-hidden className="size-3 shrink-0 rounded-[3px]" style={{ background: VIZ.ordinal[i] }} />
              <span className="flex-1 whitespace-nowrap text-ink-2">{d.label}</span>
              <span className="font-bold tabular-nums text-ink">{d.value}</span>
              <span className="w-11 text-right tabular-nums text-ink-3">{pct(d.value)}%</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
