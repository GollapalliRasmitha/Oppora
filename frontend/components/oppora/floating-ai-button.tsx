"use client";

import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { isFullScreenOnMobile } from "./nav";
import { useShell } from "./shell-context";

/** Floating Sparkles button shown on every signed-in page. */
export function FloatingAIButton() {
  const { assistantOpen, setAssistantOpen } = useShell();
  // On full-screen mobile pages the button sits above the page's own action bar.
  const raised = isFullScreenOnMobile(usePathname());
  return (
    <button
      type="button"
      onClick={() => setAssistantOpen(true)}
      aria-label="Open Oppora AI assistant"
      aria-expanded={assistantOpen}
      className={cn(
        "fixed right-4 z-40 inline-flex size-14 items-center justify-center rounded-full bg-brand text-white focus-ring transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 md:bottom-6 md:right-6",
        "shadow-[0_0_0_1px_rgba(167,139,250,.45),0_10px_30px_-6px_var(--glow-purple)] hover:shadow-[0_0_0_1px_rgba(167,139,250,.7),0_14px_40px_-6px_rgba(96,165,250,.8)]",
        raised ? "bottom-24" : "bottom-20",
        assistantOpen && "pointer-events-none opacity-0",
      )}
    >
      <Sparkles aria-hidden className="size-6" />
    </button>
  );
}
