import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Email, EmailCategory } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { Monogram } from "./monogram";

const CATEGORY_TONE: Partial<Record<EmailCategory, BadgeTone>> = {
  Internship: "purple",
  Job: "blue",
  Hackathon: "pink",
  Scholarship: "success",
  Competition: "pink",
  Fellowship: "purple",
  Event: "blue",
};

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/**
 * Email summary: sender, subject, preview, date, category, AI relevance and
 * read state. With `onOpen` the subject becomes a button (marks read, expands
 * the preview); `footer` holds actions such as Extract Opportunity.
 */
export function EmailCard({
  email,
  className,
  expanded,
  onOpen,
  footer,
}: {
  email: Email;
  className?: string;
  expanded?: boolean;
  onOpen?: () => void;
  footer?: ReactNode;
}) {
  const subjectCls = cn("block w-full truncate text-left text-sm", email.read ? "text-ink-2" : "font-semibold text-ink");
  return (
    <article
      aria-label={`${email.read ? "" : "Unread. "}${email.subject}, from ${email.sender}`}
      className={cn(
        "rounded-md border border-line bg-surface p-3.5 transition-colors",
        !email.read && "border-line-strong bg-unread",
        className,
      )}
    >
      <div className="flex gap-3">
        <Monogram name={email.sender} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {!email.read && <span aria-hidden className="size-2 shrink-0 translate-y-[-1px] rounded-full bg-pink" />}
            <span className={cn("truncate text-sm text-ink", email.read ? "font-semibold" : "font-bold")}>{email.sender}</span>
            <time dateTime={email.receivedAt} className="ml-auto shrink-0 text-meta text-ink-3">
              {dateFmt.format(new Date(email.receivedAt))}
            </time>
          </div>
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              aria-expanded={expanded}
              // truncate lives on the inner span so the hit-y area isn't clipped
              className="hit-y mt-0.5 block w-full rounded-sm text-left focus-ring [&:hover>span]:text-violet"
            >
              <span className={subjectCls}>{email.subject}</span>
            </button>
          ) : (
            <p className={cn(subjectCls, "mt-0.5")}>{email.subject}</p>
          )}
          <p className={cn("mt-0.5 text-meta text-ink-3", !expanded && "line-clamp-2")}>{email.snippet}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={CATEGORY_TONE[email.category] ?? "neutral"}>{email.category}</Badge>
            <span className="text-meta font-medium text-ink-3">{email.relevance}% relevant</span>
          </div>
        </div>
      </div>
      {footer && <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-line pt-2">{footer}</div>}
    </article>
  );
}

export function EmailCardSkeleton() {
  return (
    <div aria-hidden className="rounded-md border border-line p-3.5">
      <div className="flex gap-3">
        <Skeleton className="size-8" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
}
