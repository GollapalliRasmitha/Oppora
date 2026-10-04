import { BriefcaseBusiness, CalendarClock, Sparkles } from "lucide-react";
import Image from "next/image";
import { Monogram } from "@/components/oppora/monogram";
import { cn } from "@/lib/utils";

function FloatCard({ className, delay, children }: { className?: string; delay: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      style={{ animationDelay: delay }}
      className={cn(
        "glass-strong absolute flex animate-float items-center gap-2.5 rounded-md bg-surface/85 p-2.5 pr-3.5 text-left shadow-[var(--shadow-pop),0_0_24px_-8px_var(--glow-purple)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Original hero illustration: a student seen from behind at a desk, facing a
 * futuristic city, with orbital lines, a glowing AI orb and floating cards.
 */
export function HeroIllustration() {
  return (
    <div
      role="img"
      aria-label="Illustration: a student at a desk looks out over a glowing city while Oppora's AI orb surfaces new opportunities and deadlines."
      className="relative mx-auto aspect-[600/560] w-full max-w-[600px]"
    >
      {/*
        The night scene is a static file (public/hero-scene.svg, ~480 shapes), so
        it stays out of the page DOM: fewer nodes to style, lay out and hydrate.
      */}
      <Image
        src="/hero-scene.svg"
        alt=""
        width={600}
        height={560}
        priority
        unoptimized
        className="absolute inset-0 size-full [mask-image:radial-gradient(closest-side,#000_58%,transparent_100%)]"
      />

      {/* Floating glass cards */}
      <FloatCard className="left-0 top-[14%] sm:left-[2%]" delay="0s">
        <Monogram name="Google" size="sm" />
        <div>
          <div className="text-xs font-semibold text-ink-3">Google Careers</div>
          <div className="text-sm font-bold text-ink">Summer Internship 2027</div>
        </div>
      </FloatCard>

      <FloatCard className="bottom-[4%] right-0 sm:bottom-auto sm:right-[4%] sm:top-[4%]" delay="1.2s">
        <span className="flex size-8 items-center justify-center rounded-md bg-pink/15 text-pink">
          <CalendarClock className="size-4" />
        </span>
        <div className="text-sm font-bold text-ink">4 deadlines this week</div>
      </FloatCard>

      <FloatCard className="right-0 top-[48%] hidden sm:flex" delay="0.6s">
        <span className="flex size-8 items-center justify-center rounded-md bg-purple/20 text-violet">
          <Sparkles className="size-4" />
        </span>
        <div>
          <div className="text-xs font-semibold text-violet">New opportunity found</div>
          <div className="text-sm font-bold text-ink">Frontend Developer</div>
          <div className="text-xs text-ink-3">Amazon</div>
        </div>
      </FloatCard>

      <FloatCard className="bottom-[24%] left-[3%]" delay="1.8s">
        <span className="flex size-8 items-center justify-center rounded-md bg-blue/15 text-blue">
          <BriefcaseBusiness className="size-4" />
        </span>
        <div>
          <div className="text-xs font-semibold text-ink-3">Application deadline</div>
          <div className="text-sm font-bold text-ink">15 Dec</div>
        </div>
      </FloatCard>
    </div>
  );
}
