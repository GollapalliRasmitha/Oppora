import { cn } from "@/lib/utils";

export function Avatar({ name, online, className }: { name: string; online?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-9 shrink-0", className)}>
      <span
        aria-hidden
        className="flex size-full items-center justify-center rounded-full bg-brand text-sm font-bold text-white ring-1 ring-white/15"
      >
        {name.charAt(0).toUpperCase()}
      </span>
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-success ring-2 ring-bg">
          <span className="sr-only">Online</span>
        </span>
      )}
    </span>
  );
}
