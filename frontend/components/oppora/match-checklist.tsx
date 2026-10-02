import { CircleCheck, TriangleAlert } from "lucide-react";
import { daysLeft, daysLeftLabel } from "@/lib/domain/dates";
import type { MatchCheck, Opportunity } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type Item = { ok: boolean; label: string; detail?: string };

const join = (xs: string[]) => xs.join(", ");

/** Builds the four AI Summary checks. Unmet or unknown checks become warnings. */
export function matchChecklist(opp: Opportunity, now: Date): Item[] {
  const r = opp.matchReasons;
  const items: Item[] = [];

  const skills: Record<MatchCheck, Item> = {
    met: { ok: true, label: "Matches your skills", detail: join(r.matchedSkills) },
    unmet: { ok: false, label: "Doesn't list skills from your profile", detail: join(opp.skills) },
    unknown: { ok: false, label: "Skills not mentioned in email" },
  };
  items.push(skills[r.skills]);

  items.push(
    r.interests === "met"
      ? { ok: true, label: "Matches your interests", detail: join(r.matchedInterests) }
      : { ok: false, label: "Outside your listed interests" },
  );

  const experience: Record<MatchCheck, Item> = {
    met: { ok: true, label: "Suitable experience level", detail: opp.eligibility ?? undefined },
    unmet: { ok: false, label: "May not fit your experience level", detail: opp.eligibility ?? undefined },
    unknown: {
      ok: false,
      label: opp.eligibility ? "Check the eligibility for your level" : "Eligibility not mentioned in email",
      detail: opp.eligibility ?? undefined,
    },
  };
  items.push(experience[r.experience]);

  const d = daysLeft(opp.deadline, now);
  items.push(
    d === null
      ? { ok: false, label: "Deadline not mentioned in email" }
      : d < 0
        ? { ok: false, label: "Deadline has passed" }
        : { ok: true, label: "Deadline is still available", detail: daysLeftLabel(d) },
  );
  return items;
}

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
