"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MOBILE_NAV, isActive, isFullScreenOnMobile } from "./nav";

/** Mobile only (<768px). Home · Opportunities · Deadlines · Inbox · Profile. */
export function MobileBottomNav() {
  const pathname = usePathname();
  if (isFullScreenOnMobile(pathname)) return null;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[#080b1f]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      {/* "Opportunities" gets a wider column so every label fits at 360px. */}
      <ul className="grid grid-cols-[1fr_1.45fr_1fr_1fr_1fr]">
        {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-semibold tracking-tight text-ink-3 focus-ring transition-colors",
                  active && "text-ink",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-[background-color,box-shadow]",
                    active && "bg-purple/25 shadow-[0_0_18px_-4px_rgba(124,58,237,.8)]",
                  )}
                >
                  <Icon aria-hidden className={cn("size-5", active && "text-violet")} />
                </span>
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
