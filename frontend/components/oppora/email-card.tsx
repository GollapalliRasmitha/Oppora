import { Badge, type BadgeTone } from "@/components/ui/badge";
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
 * read state. Stage 3 adds the Inbox actions (extract, swipe to save/archive).
 */
export function EmailCard({ email, className }: { email: Email; className?: string }) {
  return (
    <article
      aria-label={`${email.read ? "" : "Unread. "}${email.subject}, from ${email.sender}`}
      className={cn(
        "flex gap-3 rounded-md border border-line bg-white/[.03] p-3.5",
        !email.read && "border-line-strong bg-white/[.05]",
        className,
      )}
    >
      <Monogram name={email.sender} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {!email.read && <span aria-hidden className="size-2 shrink-0 translate-y-[-1px] rounded-full bg-pink" />}
          <span className={cn("truncate text-sm text-ink", email.read ? "font-semibold" : "font-bold")}>{email.sender}</span>
          <time dateTime={email.receivedAt} className="ml-auto shrink-0 text-meta text-ink-3">
            {dateFmt.format(new Date(email.receivedAt))}
          </time>
        </div>
        <p className={cn("mt-0.5 truncate text-sm", email.read ? "text-ink-2" : "font-semibold text-ink")}>{email.subject}</p>
        <p className="mt-0.5 line-clamp-2 text-meta text-ink-3">{email.snippet}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={CATEGORY_TONE[email.category] ?? "neutral"}>{email.category}</Badge>
          <span className="text-meta font-medium text-ink-3">{email.relevance}% relevant</span>
        </div>
      </div>
    </article>
  );
}
