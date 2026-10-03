import { BadgeAlert, CalendarClock, Flame } from "lucide-react";
import { useId } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { daysLeftLabel, formatDate, urgencyFor } from "@/lib/domain/dates";
import type { Fee, ISODate, Priority } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const PRIORITY_TONE: Record<Priority, BadgeTone> = { High: "pink", Medium: "purple", Low: "neutral" };

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <Badge tone={PRIORITY_TONE[priority]} className={className}>
      {priority === "High" && <Flame aria-hidden />}
      {priority} Priority
    </Badge>
  );
}

const URGENCY_TEXT = {
  urgent: "text-urgent",
  soon: "text-soon",
  later: "text-later",
  passed: "text-ink-3",
  none: "text-ink-3",
} as const;

const URGENCY_TONE = { urgent: "urgent", soon: "soon", later: "later", passed: "neutral", none: "neutral" } as const;

/**
 * Deadline with days left. Colour is never the only signal — the day count
 * is always written out.
 */
export function DeadlineIndicator({
  deadline,
  days,
  variant = "stacked",
  className,
}: {
  deadline: ISODate | null;
  days: number | null;
  variant?: "stacked" | "pill";
  className?: string;
}) {
  const urgency = urgencyFor(days);
  if (variant === "pill") {
    return (
      <Badge tone={URGENCY_TONE[urgency]} className={className}>
        {daysLeftLabel(days)}
      </Badge>
    );
  }
  if (!deadline) {
    // One line, not "No deadline" + "No deadline mentioned".
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <CalendarClock aria-hidden className="size-4 shrink-0 text-ink-3" />
        <span className="text-sm font-medium text-ink-3">{daysLeftLabel(null)}</span>
      </div>
    );
  }
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <CalendarClock aria-hidden className={cn("mt-0.5 size-4 shrink-0", URGENCY_TEXT[urgency])} />
      <div className="leading-tight">
        <div className="text-sm font-semibold text-ink">{formatDate(deadline)}</div>
        <div className={cn("text-meta font-medium", URGENCY_TEXT[urgency])}>{daysLeftLabel(days)}</div>
      </div>
    </div>
  );
}

/** Horizontal match bar with "92% Match" label. */
export function MatchMeter({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        aria-label="Match with your profile"
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.07]"
      >
        <div className="h-full rounded-full bg-[image:var(--grad-ai-border)]" style={{ width: `${v}%` }} />
      </div>
      <span className="text-meta font-semibold text-ink">{v}% Match</span>
    </div>
  );
}

/** Circular match score ("92% Match") used in AI summaries. */
export function MatchRing({ value, size = 96, className }: { value: number; size?: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const gradId = `match-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-label={`${v}% match with your profile`}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c3aed" />
            <stop offset=".5" stopColor="#60a5fa" />
            <stop offset="1" stopColor="#f472b6" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          className="drop-shadow-[0_0_6px_rgba(124,58,237,.6)]"
        />
      </svg>
      <span className="relative text-center leading-none">
        <span className="block text-xl font-extrabold text-ink">{v}%</span>
        <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-ink-3">Match</span>
      </span>
    </div>
  );
}

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

/** "₹500", "$20", "INR 1,499" — or "" when the email gave no amount. */
export function formatFee(fee: Fee): string {
  if (fee.amount === null) return "";
  const n = new Intl.NumberFormat(fee.currency === "INR" ? "en-IN" : "en-GB", { maximumFractionDigits: 2 }).format(fee.amount);
  const symbol = fee.currency ? CURRENCY_SYMBOL[fee.currency] : undefined;
  return symbol ? `${symbol}${n}` : fee.currency ? `${fee.currency} ${n}` : n;
}

/** Warning shown wherever an opportunity is listed when its email asks for money. */
export function FeeBadge({ fee, className }: { fee: Fee | null; className?: string }) {
  if (!fee) return null;
  const amount = formatFee(fee);
  return (
    <Badge tone="urgent" className={className} title={`From the email: “${fee.text}”`}>
      <BadgeAlert aria-hidden />
      {amount ? `Asks for a fee: ${amount}` : "Asks for a fee"}
    </Badge>
  );
}
