"use client";

import { IntentLink as Link } from "@/components/ui/intent-link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { LogoMark } from "./logo";
import { SIDEBAR_NAV, isActive } from "./nav";
import { useShell } from "./shell-context";

export const navItemActive =
  "bg-[linear-gradient(90deg,rgba(124,58,237,.38),rgba(37,99,235,.14))] text-ink shadow-[var(--glow-active)]";

/**
 * Desktop (≥1024px): fixed 230px. Tablet (768–1023px): 72px icon rail that
 * expands over the content. Hidden on mobile (bottom nav instead).
 */
export function Sidebar({ expanded, onExpandedChange }: { expanded: boolean; onExpandedChange: (v: boolean) => void }) {
  const pathname = usePathname();
  const { user, userStatus } = useShell();
  const labelCls = expanded ? "" : "md:sr-only lg:not-sr-only";

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onExpandedChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, onExpandedChange]);

  return (
    <>
      {expanded && (
        <div aria-hidden onClick={() => onExpandedChange(false)} className="fixed inset-0 z-30 hidden bg-black/50 md:block lg:hidden" />
      )}
      <aside
        aria-label="Main"
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-chrome backdrop-blur-xl transition-[width] duration-200 md:flex",
          expanded ? "w-[var(--sidebar-w)] shadow-[var(--shadow-chrome)]" : "w-[var(--sidebar-w-collapsed)]",
          "lg:w-[var(--sidebar-w)] lg:shadow-none",
        )}
      >
        <div className={cn("flex h-16 items-center gap-2 px-4", !expanded && "md:justify-center lg:justify-start")}>
          <Link href="/dashboard" aria-label="Oppora home" className="flex items-center gap-2 rounded-md focus-ring">
            <LogoMark />
            <span className={cn("text-lg font-extrabold tracking-tight", labelCls)}>Oppora</span>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={expanded}
          className="mx-auto mb-2 inline-flex size-11 items-center justify-center rounded-md text-ink-3 focus-ring hover:bg-tint/[.06] hover:text-ink lg:hidden"
        >
          {expanded ? <PanelLeftClose aria-hidden className="size-5" /> : <PanelLeftOpen aria-hidden className="size-5" />}
        </button>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <ul className="space-y-1">
            {SIDEBAR_NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    title={expanded ? undefined : label}
                    onClick={() => expanded && onExpandedChange(false)}
                    className={cn(
                      "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-ink-2 focus-ring transition-[background-color,color,box-shadow] duration-200 hover:bg-tint/[.05] hover:text-ink",
                      !expanded && "md:justify-center lg:justify-start",
                      active && navItemActive,
                    )}
                  >
                    <Icon aria-hidden className={cn("size-5 shrink-0", active ? "text-violet" : "text-ink-3")} />
                    <span className={labelCls}>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-line p-3">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 rounded-md p-2 focus-ring transition-colors hover:bg-tint/[.05]",
              !expanded && "md:justify-center lg:justify-start",
            )}
          >
            {userStatus === "loading" ? (
              <>
                <Skeleton className="size-9 rounded-full" />
                <span className={cn("flex-1 space-y-1.5", labelCls)}>
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3 w-14" />
                </span>
              </>
            ) : (
              <>
                <Avatar name={user?.name} online={!!user} />
                <span className={cn("min-w-0", labelCls)}>
                  <span className="block truncate text-sm font-bold text-ink">{user?.name ?? "Your account"}</span>
                  <span className="block text-meta text-ink-3">{user ? `${user.plan} Plan` : "Profile unavailable"}</span>
                </span>
              </>
            )}
          </Link>
        </div>
      </aside>
    </>
  );
}
