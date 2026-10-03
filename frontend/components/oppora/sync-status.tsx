"use client";

import { CircleCheck, RefreshCw, TriangleAlert } from "lucide-react";
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
            toast.success("Sync completed", { description: "Your opportunities are up to date." });
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

function describe(s: SyncState | null, error: boolean): { title: string; detail: string } {
  if (error) return { title: "Sync status unavailable", detail: "We couldn't reach Oppora." };
  if (!s) return { title: "Checking sync status…", detail: "" };
  switch (s.phase) {
    case "scanning":
      return { title: "AI is scanning your Gmail…", detail: "Finding opportunities relevant to you." };
    case "analyzing":
      return {
        title: `${s.emailsInBatch} email${s.emailsInBatch === 1 ? "" : "s"} being analyzed…`,
        detail: "Extracting deadlines and details.",
      };
    case "error":
      return { title: "Sync failed", detail: "We couldn't access your Gmail." };
    case "idle":
      return { title: "Not synced yet", detail: "Scan Gmail to find opportunities." };
    case "completed": {
      const last = s.lastSyncedAt ? `Last synced ${relativeTime(s.lastSyncedAt, new Date())}` : "Not synced yet";
      // The AI's free-tier daily limit was reached: the rest is processed on a later sync.
      const queued = s.queued ? ` · ${s.queued} email${s.queued === 1 ? "" : "s"} queued` : "";
      return { title: "Sync completed", detail: last + queued };
    }
  }
}

/** Shared sync status. `compact` is used in tight spots like the header. */
export function SyncStatus({ className, compact }: { className?: string; compact?: boolean }) {
  const { status, error, running, sync } = useSyncStatus();
  const { title, detail } = describe(status, error);
  const failed = error || status?.phase === "error";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {running ? (
        <AIOrb className={compact ? "size-7" : "size-11"} />
      ) : failed ? (
        <span className="flex size-9 items-center justify-center rounded-full bg-urgent/10 text-urgent">
          <TriangleAlert aria-hidden className="size-4" />
        </span>
      ) : (
        <span className="flex size-9 items-center justify-center rounded-full bg-success/10 text-success">
          <CircleCheck aria-hidden className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1" role="status" aria-live="polite">
        <div className="truncate text-sm font-semibold text-ink">{title}</div>
        {detail && <div className="truncate text-meta text-ink-3">{detail}</div>}
      </div>
      {!compact && (
        <button
          type="button"
          onClick={sync}
          disabled={running}
          aria-label={running ? "Sync in progress" : "Sync Gmail now"}
          title={running ? "Sync in progress" : "Sync Gmail now"}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-3 focus-ring transition-colors hover:bg-white/[.06] hover:text-ink disabled:opacity-60"
        >
          <RefreshCw aria-hidden className={cn("size-4", running && "animate-spin")} />
        </button>
      )}
    </div>
  );
}
