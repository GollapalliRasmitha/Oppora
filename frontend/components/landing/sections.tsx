import Link from "next/link";
import {
  ArrowRight,
  Brain,
  CalendarClock,
  Layers,
  Lock,
  Mail,
  MousePointerClick,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Target,
  WandSparkles,
} from "lucide-react";
import { GoogleSignInButton, SIGN_IN_URL } from "@/components/oppora/google-sign-in-button";
import { AuthErrorNotice } from "./auth-error-notice";
import { Logo } from "@/components/oppora/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { HeroIllustration } from "./hero-illustration";

export function Hero() {
  return (
    <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pb-24 lg:pt-16">
      <div className="animate-fade-up">
        <Badge tone="purple" className="mb-5 py-1">
          <Sparkles aria-hidden />
          Your personal AI opportunity agent
        </Badge>
        <h1 className="text-hero font-extrabold tracking-tight text-ink">
          Your Gmail,
          <br />
          <span className="text-gradient">Smarter Opportunities.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-2 sm:text-lg">
          Oppora uses AI to scan your Gmail, find relevant opportunities, track deadlines and help you stay ahead — all in one place.
        </p>
        <AuthErrorNotice />
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <GoogleSignInButton />
          <Button asChild variant="ghost" size="lg">
            <Link href="#how-it-works">
              See how it works <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
        <p className="mt-4 flex items-center gap-2 text-meta font-medium text-ink-3">
          <Lock aria-hidden className="size-3.5" />
          Secure Gmail connection
        </p>
      </div>
      <HeroIllustration />
    </section>
  );
}

const FEATURES = [
  { icon: Brain, title: "AI-Powered", body: "Intelligently scans your Gmail and extracts relevant opportunities." },
  { icon: CalendarClock, title: "Smart Tracking", body: "Keeps track of deadlines and sends timely reminders." },
  { icon: Target, title: "Personalized", body: "Built around your interests, goals and career aspirations." },
  { icon: Layers, title: "All in One Place", body: "Opportunities, emails, calendar and insights — unified." },
  { icon: ShieldCheck, title: "Secure", body: "Your data stays with you. You control what Oppora can access." },
  { icon: WandSparkles, title: "Simple & Beautiful", body: "A clean interface that makes your journey easier." },
];

function SectionHeading({ id, title, subtitle }: { id: string; title: string; subtitle: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <h2 id={id} className="text-section font-extrabold tracking-tight text-ink">
        {title}
      </h2>
      <p className="mt-3 text-base text-ink-2 sm:text-lg">{subtitle}</p>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" aria-labelledby="features-heading" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
      <SectionHeading
        id="features-heading"
        title="Why Oppora?"
        subtitle="Everything you need to catch the right opportunity at the right time — without digging through your inbox."
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li key={title}>
            <GlassCard interactive className="h-full p-5">
              <span className="flex size-11 items-center justify-center rounded-md border border-violet/25 bg-purple/15 text-violet shadow-[var(--glow-soft)]">
                <Icon aria-hidden className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-ink">{title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{body}</p>
            </GlassCard>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STEPS = [
  { n: "01", icon: Mail, title: "Connect Gmail", body: "Connect your Gmail account securely." },
  { n: "02", icon: ScanSearch, title: "AI Finds Opportunities", body: "Oppora scans relevant emails and identifies opportunities." },
  { n: "03", icon: MousePointerClick, title: "Take Action", body: "Track deadlines, save opportunities and apply before time runs out." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
      <SectionHeading id="how-heading" title="How it works" subtitle="From inbox to offer in three steps." />
      <ol className="relative grid gap-8 md:grid-cols-3 md:gap-6">
        {/* Glowing timeline: vertical on mobile, horizontal on desktop */}
        <span
          aria-hidden
          className="absolute bottom-6 left-[27px] top-6 w-px bg-[linear-gradient(180deg,#7c3aed,#60a5fa,#f472b6)] shadow-[0_0_12px_rgba(124,58,237,.8)] md:bottom-auto md:left-[16.66%] md:right-[16.66%] md:top-[27px] md:h-px md:w-auto md:bg-[linear-gradient(90deg,#7c3aed,#60a5fa,#f472b6)]"
        />
        {STEPS.map(({ n, icon: Icon, title, body }) => (
          <li key={n} className="relative flex gap-4 md:flex-col md:items-center md:text-center">
            <span className="relative z-10 flex size-14 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-violet shadow-[0_0_0_6px_var(--bg),0_0_28px_-4px_rgba(124,58,237,.8)]">
              <Icon aria-hidden className="size-6" />
            </span>
            <div className="pt-1 md:pt-4">
              <div className="text-meta font-bold tracking-widest text-gradient">{n}</div>
              <h3 className="mt-1 text-lg font-bold text-ink">{title}</h3>
              <p className="mt-1 max-w-xs text-[15px] text-ink-2">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function FinalCTA() {
  return (
    <section aria-labelledby="cta-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
      <div className="ai-border relative overflow-hidden rounded-card bg-[linear-gradient(135deg,rgba(124,58,237,.28),rgba(37,99,235,.14)_55%,rgba(244,114,182,.10))] px-6 py-14 text-center shadow-[0_0_80px_-20px_rgba(124,58,237,.7)] sm:px-12 sm:py-20">
        <div aria-hidden className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-purple/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-16 size-72 rounded-full bg-blue/20 blur-3xl" />
        <h2 id="cta-heading" className="relative mx-auto max-w-3xl text-section font-extrabold tracking-tight text-ink">
          Don&apos;t let your next opportunity get buried in your inbox.
        </h2>
        <p className="relative mt-4 text-lg text-ink-2">Let Oppora find it for you.</p>
        <Button asChild size="lg" className="relative mt-8">
          <a href={SIGN_IN_URL}>
            Get Started <ArrowRight aria-hidden />
          </a>
        </Button>
      </div>
    </section>
  );
}

const FOOTER_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
];

export function Footer() {
  return (
    <footer id="about" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-2 text-sm text-ink-3">
            A personal AI agent that finds opportunities in your Gmail, tracks their deadlines and helps you act on them.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-1 gap-y-1">
            {FOOTER_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-ink-2 focus-ring hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-5 text-center text-sm font-medium text-ink-2 sm:px-6">
          <Sparkles aria-hidden className="size-4 text-violet" />
          Your future doesn&apos;t wait. Neither should you.
        </p>
      </div>
    </footer>
  );
}
