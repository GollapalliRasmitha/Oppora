import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/** Initial on the brand gradient; a generic person icon when the name is unknown. */
export function Avatar({ name, online, className }: { name?: string; online?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-9 shrink-0", className)}>
      <span
        aria-hidden
        className={cn(
          "flex size-full items-center justify-center rounded-full text-sm font-bold text-white ring-1 ring-white/15",
          name ? "bg-brand" : "bg-white/[.08] text-ink-2",
        )}
      >
        {name ? name.charAt(0).toUpperCase() : <UserRound className="size-4" />}
      </span>
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-success ring-2 ring-bg">
          <span className="sr-only">Online</span>
        </span>
      )}
    </span>
  );
}
