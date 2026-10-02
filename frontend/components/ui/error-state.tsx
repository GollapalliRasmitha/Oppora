import { RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type Props = {
  title?: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: LucideIcon;
  /** Replaces the default retry button (e.g. "Reconnect Gmail"). */
  action?: ReactNode;
  className?: string;
};

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
  icon: Icon = TriangleAlert,
  action,
  className,
}: Props) {
  return (
    <div role="alert" className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-card border border-urgent/30 bg-urgent/10 text-urgent">
        <Icon aria-hidden className="size-6" />
      </div>
      <h3 className="text-base font-bold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-2">{description}</p>
      {(action || onRetry) && (
        <div className="mt-5">
          {action ?? (
            <Button variant="secondary" onClick={onRetry}>
              <RefreshCw aria-hidden />
              {retryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
