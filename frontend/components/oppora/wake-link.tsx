"use client";

import { useState, type ComponentProps, type MouseEvent } from "react";
import { waitForBackend } from "@/lib/wake";

/**
 * A link that leaves the page for the backend (Google sign-in, Try the demo).
 * It first makes sure the free-tier backend is awake (showing "Waking up the
 * server…" while it starts), so the redirect and Google's callback never land
 * on a sleeping server. Still a real <a>: it works without JavaScript, and
 * Ctrl/⌘-click opens a new tab as usual.
 */
export function WakeLink({ href, onClick, children, ...props }: ComponentProps<"a"> & { href: string }) {
  const [waiting, setWaiting] = useState(false);

  const handle = async (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (waiting) return;
    setWaiting(true);
    const wake = await waitForBackend();
    if (wake.ok) {
      window.location.assign(href);
      return; // stays "busy" while the browser leaves the page
    }
    setWaiting(false); // the notice says it took too long; the link can be tried again
  };

  return (
    <a href={href} onClick={handle} aria-busy={waiting || undefined} {...props}>
      {children}
    </a>
  );
}
