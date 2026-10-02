import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-card border border-line-strong bg-purple/10 text-violet shadow-[var(--glow-soft)]">
        <Icon aria-hidden className="size-6" />
      </div>
      <h3 className="text-base font-bold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-2">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
