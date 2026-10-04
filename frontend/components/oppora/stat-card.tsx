import type { LucideIcon } from "lucide-react";
import { IntentLink as Link } from "@/components/ui/intent-link";
import { TrendingUp, TriangleAlert } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ACCENTS = {
  purple: "text-violet bg-purple/15 border-violet/25",
  pink: "text-pink bg-pink/10 border-pink/25",
  green: "text-success bg-success/10 border-success/25",
  blue: "text-blue bg-blue/10 border-blue/25",
} as const;

type Props = {
  icon: LucideIcon;
  value: number;
  label: string;
  trend: string;
  /** "alert" renders the trend as a warning (e.g. "2 urgent"). */
  trendKind?: "up" | "alert" | "neutral";
  accent?: keyof typeof ACCENTS;
  /** Makes the whole card a link (stretched over the label). */
  href?: string;
};

export function StatCard({ icon: Icon, value, label, trend, trendKind = "up", accent = "purple", href }: Props) {
  return (
    <GlassCard interactive={!!href} className={cn("p-4 sm:p-5", href && "relative has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-violet")}>
      <div className={cn("flex size-10 items-center justify-center rounded-md border", ACCENTS[accent])}>
        <Icon aria-hidden className="size-5" />
      </div>
      <div className="mt-3 text-stat font-extrabold tracking-tight text-ink">{value}</div>
      {href ? (
        <Link href={href} className="block text-sm font-medium text-ink-2 outline-none after:absolute after:inset-0 after:rounded-card after:content-[''] hover:text-ink">
          {label}
        </Link>
      ) : (
        <div className="text-sm font-medium text-ink-2">{label}</div>
      )}
      <div
        className={cn(
          "mt-2 inline-flex items-center gap-1 text-meta font-semibold",
          trendKind === "up" && "text-success",
          trendKind === "alert" && "text-urgent",
          trendKind === "neutral" && "text-ink-3",
        )}
      >
        {trendKind === "up" && <TrendingUp aria-hidden className="size-3.5" />}
        {trendKind === "alert" && <TriangleAlert aria-hidden className="size-3.5" />}
        {trend}
      </div>
    </GlassCard>
  );
}

export function StatCardSkeleton() {
  return (
    <GlassCard className="p-4 sm:p-5">
      <Skeleton className="size-10" />
      <Skeleton className="mt-3 h-8 w-12" />
      <Skeleton className="mt-2 h-4 w-28" />
      <Skeleton className="mt-2 h-3 w-20" />
    </GlassCard>
  );
}
