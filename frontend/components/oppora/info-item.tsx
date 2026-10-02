import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The single way to show a field the AI couldn't find. */
export function NotMentioned() {
  return <span className="italic text-ink-3">Not mentioned in email</span>;
}

/** Label + value pair for extracted fields. `null`/empty values render <NotMentioned/>. */
export function InfoItem({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode | null | undefined;
  className?: string;
}) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className={cn("flex gap-3", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-white/[.04] text-violet">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-meta font-medium text-ink-3">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-semibold text-ink">{empty ? <NotMentioned /> : children}</dd>
      </div>
    </div>
  );
}
