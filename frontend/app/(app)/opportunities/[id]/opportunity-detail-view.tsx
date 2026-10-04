"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  CircleCheck,
  Clock,
  ExternalLink,
  GraduationCap,
  BadgeAlert,
  Link2,
  MailX,
  MapPin,
  SearchX,
  Share2,
  Sparkles,
} from "lucide-react";
import { useCallback, useState } from "react";
import { AICard } from "@/components/oppora/ai-card";
import { DeadlineIndicator, FeeBadge, MatchRing, PriorityBadge, formatFee } from "@/components/oppora/badges";
import { EmailCard } from "@/components/oppora/email-card";
import { InfoItem, NotMentioned } from "@/components/oppora/info-item";
import { MatchChecklist } from "@/components/oppora/match-checklist";
import { ScoreBreakdownView } from "@/components/oppora/score-breakdown";
import { Monogram } from "@/components/oppora/monogram";
import { StatusBadge } from "@/components/oppora/opportunity-row";
import { SaveToggle } from "@/components/oppora/save-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/oppora/load-error";
import { ErrorState } from "@/components/ui/error-state";
import { GlassCard } from "@/components/ui/glass-card";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { ApiError, getOpportunity, listEmailsForOpportunity } from "@/lib/api";
import { daysLeft, formatDate } from "@/lib/domain/dates";
import { matchSentence } from "@/lib/domain/match";
import type { Opportunity } from "@/lib/domain/types";
import { useNow } from "@/lib/hooks/use-now";
import { useOpportunityActions } from "@/lib/hooks/use-opportunity-actions";
import { useResource } from "@/lib/hooks/use-resource";
import { safeExternalUrl } from "@/lib/safe-url";

type Tab = "overview" | "requirements" | "benefits" | "emails";

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
      <Link href="/opportunities">
        <ArrowLeft aria-hidden /> Back
      </Link>
    </Button>
  );
}

async function share(opp: Opportunity) {
  const url = window.location.href;
  const title = `${opp.title} · ${opp.organization}`;
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      toast.success("Shared");
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: "Paste it anywhere to share this opportunity." });
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") toast.error("Couldn't share this link. Please try again.");
  }
}

export function OpportunityDetailView({ id }: { id: string }) {
  const now = useNow();
  const res = useResource(() => getOpportunity(id));
  const { mutate } = res;
  const update = useCallback((_: string, fn: (o: Opportunity) => Opportunity) => mutate(fn), [mutate]);
  const actions = useOpportunityActions({ update });

  if (res.status === "loading" || (res.status === "success" && !now)) return <DetailSkeleton />;

  if (res.status === "error") {
    const notFound = res.error instanceof ApiError && res.error.code === "not_found";
    return (
      <>
        <BackLink />
        <GlassCard>
          {notFound ? (
            <ErrorState
              icon={SearchX}
              title="Opportunity not found"
              description="It may have been removed, or the link is wrong."
              action={
                <Button asChild variant="secondary">
                  <Link href="/opportunities">Back to opportunities</Link>
                </Button>
              }
            />
          ) : (
            <LoadError title="Couldn't load this opportunity" error={res.error} onRetry={res.reload} />
          )}
        </GlassCard>
      </>
    );
  }

  return <Detail opp={res.data} now={now!} actions={actions} />;
}

function Detail({
  opp,
  now,
  actions,
}: {
  opp: Opportunity;
  now: Date;
  actions: ReturnType<typeof useOpportunityActions>;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [applyOpen, setApplyOpen] = useState(false);
  const days = daysLeft(opp.deadline, now);
  const applied = opp.application?.status === "applied";
  const closed = days !== null && days < 0;

  const applyButton = (
    <Button
      onClick={() => setApplyOpen(true)}
      variant={applied ? "secondary" : "primary"}
      className={applied ? "border-success/40 text-success" : undefined}
    >
      {applied ? <CircleCheck aria-hidden /> : <Sparkles aria-hidden />}
      {applied ? "Applied" : "Apply Now"}
    </Button>
  );

  return (
    <article aria-labelledby="opp-title">
      <BackLink />

      <GlassCard strong className="relative overflow-hidden bg-wash p-5 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-purple/25 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-start">
          <Monogram name={opp.organization} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 id="opp-title" className="text-2xl font-extrabold tracking-tight text-ink sm:text-[28px]">
              {opp.title}
            </h1>
            <p className="mt-1 text-[15px] font-medium text-ink-2">
              {opp.organization} · {opp.type}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="purple">{opp.type}</Badge>
              <PriorityBadge priority={opp.priority} />
              <StatusBadge opp={opp} />
              <FeeBadge fee={opp.fee} />
            </div>
          </div>
          <div className="rounded-md border border-line bg-tint/[.04] px-4 py-3 md:min-w-44">
            <div className="mb-1 text-meta font-medium text-ink-3">Deadline</div>
            <DeadlineIndicator deadline={opp.deadline} days={days} />
          </div>
        </div>
        <div className="relative mt-5 hidden flex-wrap gap-2 md:flex">
          {applyButton}
          <SaveToggle saved={opp.saved} title={opp.title} onToggle={() => actions.toggleSave(opp)} />
          <Button variant="secondary" onClick={() => share(opp)}>
            <Share2 aria-hidden /> Share
          </Button>
        </div>
      </GlassCard>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <AICard orb title="AI Summary" className="lg:order-2 lg:self-start">
          <div className="flex items-center gap-4">
            <MatchRing value={opp.matchScore} size={88} />
            <p className="text-[15px] text-ink">{matchSentence(opp.matchReasons)}</p>
          </div>
          <MatchChecklist opp={opp} now={now} className="mt-5" />
          {opp.scoreBreakdown && <ScoreBreakdownView breakdown={opp.scoreBreakdown} className="mt-4" />}
        </AICard>

        <GlassCard className="min-w-0 p-2 sm:p-3 lg:order-1">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList aria-label="Opportunity details" className="px-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="requirements">Requirements</TabsTrigger>
              <TabsTrigger value="benefits">Benefits</TabsTrigger>
              <TabsTrigger value="emails">Related Emails</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="p-3 sm:p-4 focus-ring rounded-md">
              <h2 className="text-base font-bold text-ink">About the opportunity</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{opp.summary ?? <NotMentioned />}</p>
              {opp.fee && (
                <div role="note" className="mt-5 flex gap-3 rounded-md border border-urgent/35 bg-urgent/[.07] p-4">
                  <BadgeAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-urgent" />
                  <div className="text-sm text-ink-2">
                    <p className="font-semibold text-ink">
                      {formatFee(opp.fee) ? `This email asks you to pay ${formatFee(opp.fee)}.` : "This email asks you to pay a fee."} Check
                      carefully before paying anything.
                    </p>
                    <p className="mt-1">From the email: &ldquo;{opp.fee.text}&rdquo;</p>
                  </div>
                </div>
              )}
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <InfoItem icon={MapPin} label="Location">{opp.location}</InfoItem>
                <InfoItem icon={Clock} label="Duration">{opp.duration}</InfoItem>
                <InfoItem icon={GraduationCap} label="Eligibility">{opp.eligibility}</InfoItem>
                <InfoItem icon={CalendarClock} label="Deadline">{opp.deadline ? formatDate(opp.deadline) : null}</InfoItem>
                <InfoItem icon={Link2} label="Application link" className="sm:col-span-2">
                  {safeExternalUrl(opp.applicationLink) && (
                    <a href={safeExternalUrl(opp.applicationLink)!} target="_blank" rel="noopener noreferrer" className="rounded-sm text-violet [overflow-wrap:anywhere] focus-ring hover:text-ink">
                      {opp.applicationLink} <ExternalLink aria-hidden className="inline size-3.5 align-[-2px]" />
                    </a>
                  )}
                </InfoItem>
              </dl>
              <h3 className="mt-6 text-sm font-bold text-ink">Skills</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {opp.skills.length ? (
                  opp.skills.map((s) => (
                    <Badge key={s} tone={opp.matchReasons.matchedSkills.includes(s) ? "purple" : "neutral"}>
                      {opp.matchReasons.matchedSkills.includes(s) && <CircleCheck aria-hidden />}
                      {s}
                      {opp.matchReasons.matchedSkills.includes(s) && <span className="sr-only"> (you have this skill)</span>}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm">
                    <NotMentioned />
                  </span>
                )}
              </div>
            </TabsContent>

            <TabsContent value="requirements" className="p-3 sm:p-4 focus-ring rounded-md">
              <BulletList title="Requirements" items={opp.requirements} />
            </TabsContent>

            <TabsContent value="benefits" className="p-3 sm:p-4 focus-ring rounded-md">
              <BulletList title="Benefits" items={opp.benefits} />
            </TabsContent>

            <TabsContent value="emails" className="p-3 sm:p-4 focus-ring rounded-md">
              <RelatedEmails id={opp.id} />
            </TabsContent>
          </Tabs>
        </GlassCard>
      </div>

      {/* Mobile: sticky action bar (the page is full-screen, the bottom nav is hidden) */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-line bg-chrome p-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden">
        <div className="flex-1 [&>button]:w-full">{applyButton}</div>
        <SaveToggle compact saved={opp.saved} title={opp.title} onToggle={() => actions.toggleSave(opp)} className="glass" />
        <IconButton label="Share" icon={<Share2 aria-hidden />} variant="glass" onClick={() => share(opp)} />
      </div>

      <ApplyModal
        open={applyOpen}
        onOpenChange={setApplyOpen}
        opp={opp}
        closed={closed}
        onMarkApplied={() => {
          setApplyOpen(false);
          actions.apply(opp);
        }}
        onShowEmails={() => {
          setApplyOpen(false);
          setTab("emails");
        }}
      />
    </article>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  return (
    <>
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {items.length ? (
        <ul className="mt-3 space-y-2">
          {items.map((r) => (
            <li key={r} className="flex gap-2.5 text-[15px] text-ink-2">
              <CircleCheck aria-hidden className="mt-0.5 size-[18px] shrink-0 text-violet" />
              {r}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[15px]">
          <NotMentioned />
        </p>
      )}
    </>
  );
}

function RelatedEmails({ id }: { id: string }) {
  const res = useResource(() => listEmailsForOpportunity(id));
  if (res.status === "loading")
    return (
      <div aria-busy="true" aria-label="Loading related emails" className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  if (res.status === "error")
    return <ErrorState description="We couldn't load the related emails." onRetry={res.reload} className="py-6" />;
  if (res.data.length === 0)
    return (
      <EmptyState
        icon={MailX}
        className="py-6"
        title="No related emails"
        description="Oppora couldn't find other emails about this opportunity in your inbox."
      />
    );
  return (
    <>
      <h2 className="sr-only">Related emails</h2>
      <ul className="space-y-3">
        {res.data.map((e) => (
          <li key={e.id}>
            <EmailCard email={e} />
          </li>
        ))}
      </ul>
    </>
  );
}

function ApplyModal({
  open,
  onOpenChange,
  opp,
  closed,
  onMarkApplied,
  onShowEmails,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  opp: Opportunity;
  closed: boolean;
  onMarkApplied: () => void;
  onShowEmails: () => void;
}) {
  const applied = opp.application?.status === "applied";
  if (applied) {
    return (
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title="You've applied"
        description={
          opp.application?.appliedAt
            ? `You marked ${opp.title} as applied on ${new Date(opp.application.appliedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`
            : `You marked ${opp.title} as applied.`
        }
        footer={<Button onClick={() => onOpenChange(false)}>Done</Button>}
      />
    );
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Apply to ${opp.title}`}
      description="Apply on the organizer's site, then mark it as applied so Oppora can track it."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onMarkApplied}>
            <CircleCheck aria-hidden /> Mark as applied
          </Button>
        </>
      }
    >
      {closed && (
        <p className="mb-3 rounded-md border border-urgent/30 bg-urgent/10 px-3 py-2 text-sm text-urgent">
          The deadline for this opportunity has passed.
        </p>
      )}
      {safeExternalUrl(opp.applicationLink) ? (
        <Button asChild variant="secondary" className="w-full">
          <a href={safeExternalUrl(opp.applicationLink)!} target="_blank" rel="noopener noreferrer">
            Open application link <ExternalLink aria-hidden />
          </a>
        </Button>
      ) : (
        <div className="rounded-md border border-line bg-tint/[.03] p-3 text-sm text-ink-2">
          The email didn&apos;t include an application link. Check the original email for how to apply.
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={onShowEmails}>
            View related emails
          </Button>
        </div>
      )}
    </Modal>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading opportunity">
      <Skeleton className="mb-3 h-9 w-20" />
      <GlassCard className="p-6">
        <div className="flex gap-5">
          <Skeleton className="size-14" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-6 w-48 rounded-full" />
          </div>
        </div>
        <div className="mt-5 hidden gap-2 md:flex">
          <Skeleton className="h-11 w-32" />
          <Skeleton className="h-11 w-24" />
          <Skeleton className="h-11 w-24" />
        </div>
      </GlassCard>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <GlassCard className="space-y-3 p-5 lg:order-2">
          <Skeleton className="h-6 w-32" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-[88px] rounded-full" />
            <Skeleton className="h-10 flex-1" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-4 w-3/4" />
          ))}
        </GlassCard>
        <GlassCard className="space-y-4 p-5 lg:order-1">
          <div className="flex gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-6 w-24" />
            ))}
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
