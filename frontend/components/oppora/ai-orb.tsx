import { cn } from "@/lib/utils";

/** Glowing AI orb. Pulses only while `active` (and never with reduced motion). */
export function AIOrb({ className, active = true }: { className?: string; active?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-block size-10 shrink-0 rounded-full",
        "bg-[radial-gradient(circle_at_35%_30%,#fff_0%,#c4b5fd_18%,#7c3aed_48%,#2563eb_78%,#0f1336_100%)]",
        "shadow-[0_0_22px_2px_rgba(124,58,237,.55)]",
        active && "animate-pulse-orb",
        className,
      )}
    >
      <span className="absolute inset-[-6px] rounded-full border border-violet/30" />
    </span>
  );
}
