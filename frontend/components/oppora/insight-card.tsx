import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";

/** A single computed insight: label, headline value and the detail behind it. */
export function InsightCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <GlassCard className="flex gap-4 p-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-md border border-violet/25 bg-purple/15 text-violet">
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0">
        <h3 className="text-meta font-semibold text-ink-3">{label}</h3>
        <p className="mt-0.5 truncate text-lg font-bold text-ink">{value}</p>
        <p className="text-meta text-ink-2">{detail}</p>
      </div>
    </GlassCard>
  );
}

export function InsightCardSkeleton() {
  return (
    <GlassCard aria-hidden className="flex gap-4 p-5">
      <Skeleton className="size-11" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-28" />
      </div>
    </GlassCard>
  );
}
