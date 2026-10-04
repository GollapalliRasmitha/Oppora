import { cn } from "@/lib/utils";

/**
 * Glowing AI orb. Pulses only while `active` (and never with reduced motion).
 * Layers paint in order: glow, orb, ring. The animations change only transform
 * and opacity, so they run on the compositor without repainting every frame.
 */
export function AIOrb({ className, active = true }: { className?: string; active?: boolean }) {
  return (
    <span aria-hidden className={cn("relative inline-block size-10 shrink-0 rounded-full", className)}>
      {active && (
        <span className="absolute -inset-2 animate-orb-glow rounded-full bg-[radial-gradient(circle,rgba(96,165,250,.4)_0%,rgba(124,58,237,.35)_45%,transparent_70%)]" />
      )}
      <span
        className={cn(
          "absolute inset-0 rounded-full",
          "bg-[radial-gradient(circle_at_35%_30%,#fff_0%,#c4b5fd_18%,#7c3aed_48%,#2563eb_78%,#0f1336_100%)]",
          "shadow-[0_0_22px_2px_rgba(124,58,237,.55)]",
          active && "animate-pulse-orb",
        )}
      />
      <span className="absolute inset-[-6px] rounded-full border border-violet/30" />
    </span>
  );
}
