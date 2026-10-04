"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import type { ScoreBreakdown, ScorePart } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

function partValue(p: ScorePart): string {
  if (p.points === null) return p.key === "skills" ? "Not mentioned · neutral" : "Not known · neutral";
  if (p.key === "deadline") return p.status === "passed" ? `0 / ${p.max} · closed` : `${p.points} / ${p.max}`;
  return `${p.points} / ${p.max}`;
}

/** "How this match % is worked out": every number adds up to the score shown. */
export function ScoreBreakdownView({ breakdown, className }: { breakdown: ScoreBreakdown; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const w = Math.round(breakdown.profileWeight * 100);
  const profilePart = Math.round(breakdown.profileWeight * breakdown.profile);
  // Rounding: let this line absorb it so the lines add up to the score (unless the score was capped at 0/100).
  const exact = breakdown.score - profilePart - breakdown.locationBonus + breakdown.feePenalty;
  const capped = breakdown.score === 0 || breakdown.score === 100;
  const relevancePart = capped ? Math.round((1 - breakdown.profileWeight) * breakdown.relevance) : exact;

  return (
    <div className={cn("rounded-md border border-line bg-tint/[.03]", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-sm font-semibold text-ink focus-ring"
      >
        How this match % is worked out
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={id} className="space-y-3 px-3 pb-3 text-sm">
          <div>
            <p className="flex justify-between font-semibold text-ink">
              <span>Profile fit</span>
              <span>{breakdown.profile}%</span>
            </p>
            <dl className="mt-1.5 space-y-1.5">
              {breakdown.parts.map((p) => (
                <div key={p.key}>
                  <div className="flex justify-between gap-2 text-meta">
                    <dt className="text-ink-2">{p.label}</dt>
                    <dd className={cn("font-medium", p.points === null ? "text-ink-3" : "text-ink")}>{partValue(p)}</dd>
                  </div>
                  {p.points !== null && (
                    <div aria-hidden className="mt-0.5 h-1 overflow-hidden rounded-full bg-tint/[.08]">
                      <div className="h-full rounded-full bg-violet" style={{ width: `${(p.points / p.max) * 100}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </dl>
            <p className="mt-1.5 text-meta text-ink-3">Checks the email can&apos;t answer are left out, so they don&apos;t count against you.</p>
          </div>
          <div className="space-y-1 border-t border-line pt-2 text-meta text-ink-2">
            <p className="flex justify-between">
              <span>Profile fit × {w}%</span>
              <span>{profilePart}</span>
            </p>
            <p className="flex justify-between">
              <span>AI relevance {breakdown.relevance}% × {100 - w}%</span>
              <span>{relevancePart}</span>
            </p>
            {breakdown.locationBonus > 0 && (
              <p className="flex justify-between">
                <span>Preferred location</span>
                <span>+{breakdown.locationBonus}</span>
              </p>
            )}
            {breakdown.feePenalty > 0 && (
              <p className="flex justify-between text-urgent">
                <span>Asks for a fee</span>
                <span>−{breakdown.feePenalty}</span>
              </p>
            )}
            <p className="flex justify-between border-t border-line pt-1 text-sm font-semibold text-ink">
              <span>Match</span>
              <span>{breakdown.score}%</span>
            </p>
          </div>
          <p className="text-meta text-ink-3">The profile/AI mix follows Settings → AI preferences → Personalization.</p>
        </div>
      )}
    </div>
  );
}
