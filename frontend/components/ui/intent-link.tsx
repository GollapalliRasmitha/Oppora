"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * Drop-in `next/link` that prefetches on intent (hover, focus or touch start)
 * instead of when it scrolls into view — the "hover-triggered prefetch" pattern
 * from the Next.js prefetching guide. Pages with many links (the shell nav, lists
 * of opportunities) otherwise fire a prefetch per route while the page is still
 * loading. After the first sign of intent the link behaves like a default Link.
 */
export function IntentLink({ prefetch, onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? (prefetch ?? null) : false}
      onMouseEnter={(e) => {
        setIntent(true);
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        setIntent(true);
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        setIntent(true);
        onTouchStart?.(e);
      }}
    />
  );
}
