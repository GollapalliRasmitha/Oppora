"use client";

import Link from "next/link";
import { Archive, ArrowUpRight, Bookmark, Inbox as InboxIcon, Loader2, Mail, MailOpen, ScanSearch, SearchX, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { EmailCard, EmailCardSkeleton } from "@/components/oppora/email-card";
import { LoadError } from "@/components/oppora/load-error";
import { PageHeader } from "@/components/oppora/page-header";
import { PageSearch } from "@/components/oppora/page-search";
import { SaveToggle } from "@/components/oppora/save-toggle";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { GlassCard } from "@/components/ui/glass-card";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Swipeable } from "@/components/ui/swipeable";
import { listEmails, listOpportunities } from "@/lib/api";
import { INBOX_FILTERS, buildInbox, parseInboxFilter, type InboxFilter } from "@/lib/domain/inbox";
import type { Email, Opportunity } from "@/lib/domain/types";
import { useEmailActions } from "@/lib/hooks/use-email-actions";
import { useNow } from "@/lib/hooks/use-now";
import { useResource } from "@/lib/hooks/use-resource";
import { useScanGmail } from "@/lib/hooks/use-scan-gmail";
import { useUrlParams } from "@/lib/hooks/use-url-params";

type Data = { emails: Email[]; opps: Opportunity[] };
const loadInbox = () => Promise.all([listEmails(), listOpportunities()]).then(([emails, opps]): Data => ({ emails, opps }));
const DEFAULTS = { q: "", filter: "All" };

/** Suspense fallback (before the URL params are readable): same shape as the loading state. */
export function InboxFallback() {
  return (
    <>
      <PageHeader title="Inbox" subtitle="Relevant emails from your Gmail." />
      <div aria-hidden className="mb-6 space-y-3">
        <Skeleton className="h-11 w-full sm:max-w-md" />
        <Skeleton className="h-11 w-full max-w-sm" />
      </div>
      <div aria-busy="true" aria-label="Loading emails" className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <EmailCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

export function InboxView() {
  const scanGmail = useScanGmail();
  const now = useNow();
  const [params, setParams] = useUrlParams(DEFAULTS);
  const q = params.q;
  const filter = parseInboxFilter(params.filter);
  const res = useResource(loadInbox);
  const { mutate } = res;
  const [expanded, setExpanded] = useState<string | null>(null);

  const patch = useCallback(
    (id: string, fn: (e: Email) => Email) => mutate((d) => ({ ...d, emails: d.emails.map((e) => (e.id === id ? fn(e) : e)) })),
    [mutate],
  );
  const onExtracted = useCallback((o: Opportunity) => mutate((d) => ({ ...d, opps: [...d.opps, o] })), [mutate]);
  const actions = useEmailActions({ patch, onExtracted });

  const view = useMemo(
    () => (res.status === "success" && now ? buildInbox(res.data.emails, res.data.opps, q, filter, now) : null),
    [res.status, res.data, q, filter, now],
  );
  const total = res.status === "success" ? res.data.emails.length : 0;
  const visibleTotal = res.status === "success" ? res.data.emails.filter((e) => !e.archived).length : 0;

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Relevant emails from your Gmail."
        actions={view && view.unread > 0 ? <span className="text-meta font-semibold text-ink-3">{view.unread} unread</span> : undefined}
      />

      <div className="mb-6 space-y-3 max-sm:contents">
        <PageSearch
          value={q}
          onValueChange={(v) => setParams({ q: v })}
          label="Search emails"
          placeholder="Search emails…"
          className="sm:max-w-md"
        />
        <div className="max-sm:mb-6">
          <FilterChips<InboxFilter>
            label="Filter emails"
            value={filter}
            onValueChange={(v) => setParams({ filter: v })}
            options={INBOX_FILTERS.map((f) => ({ value: f, label: f, count: view?.counts[f] }))}
          />
        </div>
      </div>

      {(res.status === "loading" || (res.status === "success" && !view)) && (
        <div aria-busy="true" aria-label="Loading emails" className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <EmailCardSkeleton key={i} />
          ))}
        </div>
      )}

      {res.status === "error" && (
        <GlassCard>
          <LoadError title="Couldn't load your inbox" error={res.error} onRetry={res.reload} />
        </GlassCard>
      )}

      {view && total === 0 && (
        <GlassCard>
          <EmptyState
            icon={InboxIcon}
            title="No relevant emails yet"
            description="Once Oppora scans your Gmail, emails about opportunities and deadlines show up here."
            action={
              <Button onClick={() => scanGmail()}>
                <ScanSearch aria-hidden /> Scan Gmail
              </Button>
            }
          />
        </GlassCard>
      )}

      {view && total > 0 && (
        <>
          <p aria-live="polite" className="mb-3 text-meta font-medium text-ink-3">
            {view.items.length} {view.items.length === 1 ? "email" : "emails"}
            {q && <> matching “{q}”</>}
            {filter !== "All" && <> · {filter}</>}
            <span className="sm:hidden"> · Swipe right to save, left to archive</span>
          </p>

          {view.items.length === 0 ? (
            <GlassCard>
              {visibleTotal === 0 && !q ? (
                <EmptyState icon={Archive} title="Your inbox is clear" description="You've archived every email. New relevant emails will appear here after the next sync." />
              ) : (
                <EmptyState
                  icon={SearchX}
                  title={q ? `No emails match “${q}”` : `No ${filter.toLowerCase()} emails`}
                  description="Try a different keyword or clear the filters."
                  action={
                    <Button variant="secondary" onClick={() => setParams({ q: "", filter: "All" })}>
                      Clear filters
                    </Button>
                  }
                />
              )}
            </GlassCard>
          ) : (
            <ul className="space-y-2">
              {view.items.map((e) => (
                <li key={e.id}>
                  <Swipeable
                    right={{
                      label: e.saved ? "Unsave" : "Save",
                      icon: <Bookmark aria-hidden />,
                      className: "bg-purple/40 text-white",
                      onTrigger: () => actions.toggleSave(e),
                    }}
                    left={{
                      label: "Archive",
                      icon: <Archive aria-hidden />,
                      className: "bg-urgent/35 text-white",
                      onTrigger: () => actions.archive(e),
                    }}
                  >
                    <EmailCard
                      email={e}
                      expanded={expanded === e.id}
                      onOpen={() => {
                        actions.open(e);
                        setExpanded((x) => (x === e.id ? null : e.id));
                      }}
                      footer={
                        <>
                          {e.opportunityId ? (
                            <Button asChild size="sm" variant="ghost">
                              <Link href={`/opportunities/${e.opportunityId}`}>
                                <ArrowUpRight aria-hidden /> View opportunity
                              </Link>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={actions.extracting.has(e.id)}
                              aria-busy={actions.extracting.has(e.id)}
                              onClick={() => actions.extract(e)}
                            >
                              {actions.extracting.has(e.id) ? (
                                <Loader2 aria-hidden className="animate-spin" />
                              ) : (
                                <Sparkles aria-hidden className="text-violet" />
                              )}
                              {actions.extracting.has(e.id) ? "Extracting…" : "Extract Opportunity"}
                            </Button>
                          )}
                          <span className="ml-auto flex items-center">
                            <IconButton
                              label={e.read ? `Mark "${e.subject}" as unread` : `Mark "${e.subject}" as read`}
                              icon={e.read ? <Mail aria-hidden /> : <MailOpen aria-hidden />}
                              onClick={() => actions.toggleRead(e)}
                            />
                            <SaveToggle compact saved={e.saved} title={`email "${e.subject}"`} onToggle={() => actions.toggleSave(e)} />
                            <IconButton label={`Archive "${e.subject}"`} icon={<Archive aria-hidden />} onClick={() => actions.archive(e)} />
                          </span>
                        </>
                      }
                    />
                  </Swipeable>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
