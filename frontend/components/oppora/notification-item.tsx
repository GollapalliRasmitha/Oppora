import Link from "next/link";
import { BriefcaseBusiness, Check, Hourglass, Sparkles } from "lucide-react";
import type { Notification } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const KIND = {
  new_opportunity: { icon: BriefcaseBusiness, cls: "bg-purple/15 text-violet" },
  deadline: { icon: Hourglass, cls: "bg-soon/10 text-soon" },
  ai_recommendation: { icon: Sparkles, cls: "bg-blue/10 text-blue" },
} as const;

export function NotificationItem({
  item,
  onMarkRead,
  onNavigate,
}: {
  item: Notification;
  onMarkRead: (n: Notification) => void;
  onNavigate?: () => void;
}) {
  const { icon: Icon, cls } = KIND[item.kind];
  const href = item.href ?? (item.opportunityId ? `/opportunities/${item.opportunityId}` : "/opportunities");
  return (
    <li className={cn("relative flex gap-3 rounded-md p-3 transition-colors hover:bg-tint/[.04]", !item.read && "bg-tint/[.03]")}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", cls)}>
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {!item.read && <span className="size-2 shrink-0 rounded-full bg-pink" aria-label="Unread" />}
          <Link href={href} onClick={onNavigate} className="rounded-sm text-sm font-semibold text-ink focus-ring hover:text-violet">
            {item.title}
          </Link>
        </div>
        <p className="mt-0.5 text-sm text-ink-2">{item.body}</p>
      </div>
      {!item.read && (
        <button
          type="button"
          onClick={() => onMarkRead(item)}
          aria-label={`Mark "${item.title}" as read`}
          title="Mark as read"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-3 focus-ring hover:bg-tint/[.06] hover:text-ink"
        >
          <Check aria-hidden className="size-4" />
        </button>
      )}
    </li>
  );
}
