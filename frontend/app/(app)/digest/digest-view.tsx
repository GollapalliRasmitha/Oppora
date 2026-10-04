"use client";

import Link from "next/link";
import { BadgeAlert, CalendarClock, CircleCheck, Hourglass, Bookmark, Sparkles, Star } from "lucide-react";
import type { ReactNode } from "react";
import { DeadlineIndicator, FeeBadge } from "@/components/oppora/badges";
import { LoadError } from "@/components/oppora/load-error";
import { Monogram } from "@/components/oppora/monogram";
import { PageHeader } from "@/components/oppora/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDigest } from "@/lib/api";
import type { Digest, DigestItem } from "@/lib/domain/types";
import { useResource } from "@/lib/hooks/use-resource";

function Section({ icon, title, count, empty, children }: { icon: ReactNode; title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <GlassCard as="section" aria-label={title} className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
        <span className="text-violet [&_svg]:size-5">{icon}</span>
        {title}
        {count > 0 && <span className="text-meta font-semibold text-ink-3">({count})</span>}
      </h2>
      {count === 0 ? <p className="text-sm text-ink-2">{empty}</p> : children}
    </GlassCard>
  );
}

function Row({ o, children }: { o: DigestItem; children?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Monogram name={o.organization} size="sm" />
      <div className="min-w-0 flex-1">
        <Link href={`/opportunities/${o.id}`} className="hit-y rounded-sm text-sm font-semibold text-ink focus-ring hover:text-violet">
          {o.title}
        </Link>
        <p className="text-meta text-ink-3">
          {o.organization} · {o.type} · {o.matchScore}% match
        </p>
        {children}
      </div>
      <FeeBadge fee={o.fee} className="hidden sm:inline-flex" />
    </li>
  );
}

function DigestContent({ d }: { d: Digest }) {
  const p = d.progress;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section icon={<Star />} title="Top matches" count={d.topMatches.length} empty="No open strong matches right now.">
        <ul className="divide-y divide-line">
          {d.topMatches.map((o) => (
            <Row key={o.id} o={o}>
              <p className="mt-1 text-sm text-ink-2">{o.why}</p>
            </Row>
          ))}
        </ul>
      </Section>

      <Section icon={<CalendarClock />} title="Deadlines in the next 7 days" count={d.deadlinesSoon.length} empty="No deadlines in the next 7 days.">
        <ul className="divide-y divide-line">
          {d.deadlinesSoon.map((o) => (
            <Row key={o.id} o={o}>
              <DeadlineIndicator className="mt-1" deadline={o.deadline} days={o.daysLeft} variant="pill" />
            </Row>
          ))}
        </ul>
      </Section>

      <Section icon={<Sparkles />} title="New this week" count={d.newThisWeek.length} empty="Nothing new was found in the last 7 days.">
        <ul className="divide-y divide-line">
          {d.newThisWeek.map((o) => (
            <Row key={o.id} o={o} />
          ))}
        </ul>
      </Section>

      <Section icon={<BadgeAlert />} title="Asks for a fee" count={d.feeWarnings.length} empty="None of your opportunities asks for a fee.">
        <p className="mb-1 text-meta text-ink-3">The email itself asks for payment. Check carefully before paying anything.</p>
        <ul className="divide-y divide-line">
          {d.feeWarnings.map((o) => (
            <Row key={o.id} o={o}>
              <p className="mt-1 text-meta text-ink-2">From the email: &ldquo;{o.fee?.text}&rdquo;</p>
            </Row>
          ))}
        </ul>
      </Section>

      <GlassCard as="section" aria-label="Application progress" className="p-5 lg:col-span-2">
        <h2 className="mb-3 text-lg font-bold text-ink">Application progress</h2>
        {p.total === 0 ? (
          <p className="text-sm text-ink-2">No opportunities tracked yet.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: <CircleCheck />, label: "Applied", value: `${p.applied}`, sub: `${p.appliedPercent}% of ${p.total}` },
              { icon: <Hourglass />, label: "In progress", value: `${p.inProgress}` },
              { icon: <Bookmark />, label: "Saved, not started", value: `${p.saved}` },
              { icon: <Sparkles />, label: "Tracked", value: `${p.total}` },
            ].map((x) => (
              <div key={x.label} className="rounded-md border border-line bg-tint/[.03] p-3">
                <dt className="flex items-center gap-1.5 text-meta font-medium text-ink-3 [&_svg]:size-4">
                  {x.icon}
                  {x.label}
                </dt>
                <dd className="mt-1 text-2xl font-extrabold text-ink">{x.value}</dd>
                {x.sub && <dd className="text-meta text-ink-3">{x.sub}</dd>}
              </div>
            ))}
          </dl>
        )}
      </GlassCard>
    </div>
  );
}

export function DigestView() {
  const res = useResource(getDigest);
  return (
    <>
      <PageHeader
        title="Weekly digest"
        subtitle={res.status === "success" && res.data.weekLabel ? `${res.data.weekLabel} · from your own opportunities` : "From your own opportunities"}
      />
      {res.status === "loading" && (
        <div aria-busy="true" aria-label="Loading the digest" className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <GlassCard key={i} className="space-y-3 p-5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </GlassCard>
          ))}
        </div>
      )}
      {res.status === "error" && (
        <GlassCard>
          <LoadError title="Couldn't load the digest" error={res.error} onRetry={res.reload} />
        </GlassCard>
      )}
      {res.status === "success" && <DigestContent d={res.data} />}
    </>
  );
}
