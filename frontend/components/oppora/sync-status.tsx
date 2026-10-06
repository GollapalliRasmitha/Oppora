"use client";

import { CircleCheck, Hourglass, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { getSyncStatus } from "@/lib/api";
import { useScanGmail } from "@/lib/hooks/use-scan-gmail";
import { relativeTime } from "@/lib/domain/dates";
import type { SyncStatus as SyncState } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { AIOrb } from "./ai-orb";

const POLL_MS = 700;

/** Polls the sync service while a sync is running (Stage 9: /api/sync/). */
export function useSyncStatus() {
  const [status, setStatus] = useState<SyncState | null>(null);
  const [error, setError] = useState(false);
  const [, setTick] = useState(0);
  const prevPhase = useRef<SyncState["phase"] | null>(null);
  const running = status?.phase === "scanning" || status?.phase === "analyzing";

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getSyncStatus()
        .then((s) => {
          if (cancelled) return;
          setError(false);
          if (prevPhase.current && prevPhase.current !== "completed" && s.phase === "completed") {
            // Honest: "Sync completed" only when nothing is waiting; otherwise why, and when it continues.
            const d = describeSync(s, false);
            if (d.tone === "ok") toast.success("Sync completed", { description: d.detail });
            else toast.info(d.title, { description: d.detail });
          }
          prevPhase.current = s.phase;
          setStatus(s);
        })
        .catch(() => !cancelled && setError(true));
    load();
    const id = setInterval(load, running ? POLL_MS : 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [running]);

  // Re-render every 30s so "Last synced N minutes ago" stays fresh.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const scan = useScanGmail();
  const sync = useCallback(async () => {
    const s = await scan();
    if (!s) return;
    prevPhase.current = s.phase;
    setStatus(s);
  }, [scan]);

  return { status, error, running, sync };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Fetched 312 emails · analysed 48 · found 7 opportunities" (the honest totals for this mailbox). */
export function syncCounts(s: SyncState): string {
  if (s.fetched === undefined) return "";
  return `Fetched ${plural(s.fetched, "email")} · analysed ${s.analysed ?? 0} · found ${plural(s.found ?? 0, "opportunity", "opportunities")}`;
}

function resetTime(iso: string | null | undefined): string {
  if (!iso) return "the daily reset";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export type SyncTone = "ok" | "running" | "waiting" | "problem";

/**
 * What the sync card says. "Sync completed" only when nothing is waiting; otherwise
 * it says exactly why emails are waiting and when analysis continues.
 */
export function describeSync(
  s: SyncState | null,
  error: boolean,
  now = new Date(),
): { title: string; detail: string; meta: string; tone: SyncTone } {
  if (error) return { title: "Sync status unavailable", detail: "We couldn't reach Oppora.", meta: "", tone: "problem" };
  if (!s) return { title: "Checking sync status…", detail: "", meta: "", tone: "ok" };
  const counts = syncCounts(s);
  const last = s.lastSyncedAt ? `Last synced ${relativeTime(s.lastSyncedAt, now)}` : "";
  switch (s.phase) {
    case "scanning":
      return { title: "AI is scanning your Gmail…", detail: "Finding opportunities relevant to you.", meta: counts, tone: "running" };
    case "analyzing":
      return {
        title: `${plural(s.emailsInBatch, "email")} being analysed…`,
        detail: "Extracting deadlines and details.",
        meta: counts,
        tone: "running",
      };
    case "error":
      return { title: "Sync failed", detail: "We couldn't access your Gmail.", meta: counts, tone: "problem" };
    case "idle":
      return { title: "Not synced yet", detail: "Scan Gmail to find opportunities.", meta: "", tone: "ok" };
    case "completed": {
      const waiting = s.queued ? `${plural(s.queued, "email")} waiting` : "";
      if (!waiting) return { title: "Sync completed", detail: counts || last, meta: counts ? last : "", tone: "ok" };
      switch (s.waitReason) {
        case "ai_quota":
          return {
            title: "Analysis paused: today's AI limit is used up",
            detail: `${waiting} · continues automatically after ${resetTime(s.resetsAt)}`,
            meta: counts,
            tone: "waiting",
          };
        case "ai_share":
          return {
            title: "Analysis paused: your share of today's AI limit is used up",
            detail: `${waiting} · continues automatically after ${resetTime(s.resetsAt)}`,
            meta: counts,
            tone: "waiting",
          };
        case "ai_unavailable":
          return {
            title: "AI analysis isn't working right now",
            detail: `${waiting}${s.waitDetail ? ` · ${s.waitDetail}` : ""}`,
            meta: counts,
            tone: "problem",
          };
        case "ai_busy":
          return {
            title: "The AI is busy right now",
            detail: `${waiting} · Oppora tries again automatically within the hour`,
            meta: counts,
            tone: "waiting",
          };
        case "ai_choice":
          return {
            title: "Choose how Oppora reads your emails",
            detail: `${waiting} · answer the AI question to start`,
            meta: counts,
            tone: "waiting",
          };
        case "time_box":
          return {
            title: "Analysing your emails in batches",
            detail: `${waiting} · continues automatically within the hour, or press Sync to continue now`,
            meta: counts,
            tone: "waiting",
          };
        default:
          return { title: `${plural(s.queued ?? 0, "email")} waiting to be analysed`, detail: counts || last, meta: "", tone: "waiting" };
      }
    }
  }
}

/** Shared sync status. `compact` is used in tight spots like the header. */
export function SyncStatus({ className, compact }: { className?: string; compact?: boolean }) {
  const { status, error, running, sync } = useSyncStatus();
  const { title, detail, meta, tone } = describeSync(status, error);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {running ? (
        <AIOrb className={compact ? "size-7" : "size-11"} />
      ) : tone === "problem" ? (
        <span className="flex size-9 items-center justify-center rounded-full bg-urgent/10 text-urgent">
          <TriangleAlert aria-hidden className="size-4" />
        </span>
      ) : tone === "waiting" ? (
        <span className="flex size-9 items-center justify-center rounded-full bg-soon/10 text-soon">
          <Hourglass aria-hidden className="size-4" />
        </span>
      ) : (
        <span className="flex size-9 items-center justify-center rounded-full bg-success/10 text-success">
          <CircleCheck aria-hidden className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1" role="status" aria-live="polite">
        {/* Long reasons wrap rather than truncate: the point of this card is to say what's going on. */}
        <div className={cn("text-sm font-semibold text-ink", compact ? "truncate" : "line-clamp-2")}>{title}</div>
        {detail && <div className={cn("text-meta text-ink-3", compact ? "truncate" : "line-clamp-2")}>{detail}</div>}
        {meta && !compact && <div className="truncate text-meta text-ink-3">{meta}</div>}
      </div>
      {!compact && (
        <button
          type="button"
          onClick={sync}
          disabled={running}
          aria-label={running ? "Sync in progress" : "Sync Gmail now"}
          title={running ? "Sync in progress" : "Sync Gmail now"}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-3 focus-ring transition-colors hover:bg-tint/[.06] hover:text-ink disabled:opacity-60"
        >
          <RefreshCw aria-hidden className={cn("size-4", running && "animate-spin")} />
        </button>
      )}
    </div>
  );
}
