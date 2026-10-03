import { CircleCheck, TriangleAlert } from "lucide-react";
import { matchChecklist } from "@/lib/domain/match";
import type { Opportunity } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export { matchChecklist };

export function MatchChecklist({ opp, now, className }: { opp: Opportunity; now: Date; className?: string }) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {matchChecklist(opp, now).map((item) => (
        <li key={item.label} className="flex gap-2.5">
          {item.ok ? (
            <CircleCheck aria-hidden className="mt-0.5 size-[18px] shrink-0 text-success" />
          ) : (
            <TriangleAlert aria-hidden className="mt-0.5 size-[18px] shrink-0 text-soon" />
          )}
          <span className="min-w-0 text-sm">
            <span className="sr-only">{item.ok ? "Met: " : "Warning: "}</span>
            <span className={cn("font-semibold", item.ok ? "text-ink" : "text-soon")}>{item.label}</span>
            {item.detail && <span className="block text-meta text-ink-3">{item.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
