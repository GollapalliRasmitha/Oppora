"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, EyeOff, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { LoadError } from "@/components/oppora/load-error";
import { Logo } from "@/components/oppora/logo";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { getSettings, startSync, updatePreferences } from "@/lib/api";
import type { AIMode } from "@/lib/domain/types";
import { useResource } from "@/lib/hooks/use-resource";

/** Only same-site paths: the consent screen never sends anyone off-site. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

const REMOVED = ["email addresses", "phone numbers", "OTPs and verification codes", "sign-in and reset links", "your name"];

/**
 * The AI consent screen: shown after the first sign-in, before any scan.
 * The choice is saved on the account and can be changed in Settings → Privacy.
 */
export function WelcomeView() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const res = useResource(getSettings);
  const [busy, setBusy] = useState<AIMode | null>(null);
  const answered = res.status === "success" && res.data.preferences.ai.mode !== "ask";

  useEffect(() => {
    if (answered) router.replace(next); // already chosen: nothing to ask
  }, [answered, next, router]);

  const choose = async (mode: Exclude<AIMode, "ask">) => {
    if (res.status !== "success") return;
    setBusy(mode);
    try {
      await updatePreferences({ ai: { mode } });
    } catch {
      toast.error("Couldn't save your choice. Please try again.");
      setBusy(null);
      return;
    }
    if (res.data.gmail.status === "connected") {
      try {
        await startSync(); // the first scan starts only now, after the choice
        toast.info(mode === "ai" ? "Oppora AI is analyzing your Gmail…" : "Oppora is reading your Gmail…", {
          description: mode === "ai" ? "Finding opportunities relevant to you." : "Using rules only: nothing is sent to an AI.",
        });
      } catch {
        // The dashboard's Scan Gmail button can start it; the choice is saved either way.
      }
    }
    router.replace(next);
  };

  return (
    <GlassCard strong className="ai-border relative w-full max-w-xl p-6 sm:p-8">
      <Logo />
      {res.status === "loading" || answered ? (
        <div aria-busy="true" aria-label="Loading" className="mt-6 space-y-3">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : res.status === "error" ? (
        <LoadError title="Couldn't load your account" error={res.error} onRetry={res.reload} />
      ) : (
        <>
          <h1 className="mt-6 text-page font-extrabold tracking-tight text-ink">Before Oppora reads your Gmail</h1>
          <p className="mt-3 text-body text-ink">
            Oppora sends the <strong>subject, sender and a cleaned, shortened copy</strong> of opportunity-like emails to{" "}
            <strong>Google&apos;s Gemini free tier</strong>, where Google may review it.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-line bg-tint/[.03] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ShieldCheck aria-hidden className="size-4 text-success" /> Removed before sending
              </p>
              <ul className="mt-2 space-y-1 text-meta text-ink-2">
                {REMOVED.map((x) => (
                  <li key={x} className="flex items-center gap-1.5">
                    <CircleCheck aria-hidden className="size-3.5 shrink-0 text-success" /> {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-line bg-tint/[.03] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <EyeOff aria-hidden className="size-4 text-violet" /> Never sent
              </p>
              <p className="mt-2 text-meta text-ink-2">
                Attachments, and emails that don&apos;t look like opportunities (promotions, chats, your own mail). Up to 4,000
                characters of text per email.
              </p>
            </div>
          </div>

          <p className="mt-5 text-sm text-ink-2">
            <strong className="text-ink">Without AI</strong>, Oppora reads emails with simple rules on its own server and nothing is
            sent to an AI. It&apos;s less thorough: it can miss details like eligibility or interviews.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="sm:flex-1" disabled={busy !== null} onClick={() => choose("ai")}>
              <Sparkles aria-hidden /> {busy === "ai" ? "Saving…" : "Continue"}
            </Button>
            <Button size="lg" variant="secondary" className="sm:flex-1" disabled={busy !== null} onClick={() => choose("rules")}>
              {busy === "rules" ? "Saving…" : "Use without AI"}
            </Button>
          </div>
          <p className="mt-4 text-meta text-ink-3">
            You can change this anytime in Settings → Privacy.{" "}
            <Link href="/privacy" className="font-semibold text-violet focus-ring rounded-sm hover:text-ink">
              How Oppora handles your data
            </Link>
          </p>
        </>
      )}
    </GlassCard>
  );
}
