import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIOrb } from "./ai-orb";

type Props = {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  /** Shows the orb instead of the Sparkles icon in the header. */
  orb?: boolean;
  className?: string;
};

/** Card for AI-generated content: gradient hairline border + soft glow. */
export function AICard({ title = "AI Recommendation", children, actions, orb, className }: Props) {
  return (
    <section
      aria-label={title}
      className={cn(
        "ai-border relative overflow-hidden rounded-card bg-wash-ai p-5 shadow-[var(--glow-ai)]",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-purple/25 blur-3xl" />
      <div className="relative flex items-center gap-2.5">
        {orb ? (
          <AIOrb className="size-7" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-md bg-purple/20 text-violet">
            <Sparkles aria-hidden className="size-4" />
          </span>
        )}
        <h2 className="text-base font-bold text-ink">{title}</h2>
      </div>
      <div className="relative mt-3 text-body leading-relaxed text-ink-2">{children}</div>
      {actions && <div className="relative mt-4 flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}

/** Shown in place of an AI recommendation when the user turned recommendations off. */
export function RecommendationsOffCard({ className }: { className?: string }) {
  return (
    <AICard
      className={className}
      actions={
        <Button asChild size="sm" variant="secondary">
          <Link href="/settings#ai-preferences">Turn on in Settings</Link>
        </Button>
      }
    >
      <p>AI recommendations are turned off.</p>
    </AICard>
  );
}
