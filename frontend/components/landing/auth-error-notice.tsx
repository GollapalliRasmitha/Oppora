"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

/** What went wrong when Google sign-in sent the user back with ?auth_error=<code>. */
const MESSAGES: Record<string, string> = {
  access_denied:
    "Sign-in didn't go through. While Oppora is in Google's testing phase, only invited Google accounts can connect Gmail. Try the demo instead, or ask to be added.",
  not_configured: "Google sign-in isn't set up on this server yet. See the README for the Google Cloud steps.",
  email_unverified: "Your Google account's email address isn't verified.",
  expired: "That sign-in took too long. Please try again.",
  rate_limited: "Too many sign-in attempts. Please wait a minute and try again.",
  demo_unavailable: "The demo isn't available right now. Please try again in a few minutes.",
};
const FALLBACK = "We couldn't sign you in with Google. Please try again.";

// Read once on the client (null during SSR, so there's no hydration mismatch).
let code: string | null | undefined;
const getSnapshot = () => (code ??= new URLSearchParams(window.location.search).get("auth_error"));
const getServerSnapshot = () => null;
const subscribe = () => () => {};

export function AuthErrorNotice() {
  const error = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (error) window.history.replaceState(null, "", window.location.pathname);
  }, [error]);

  if (!error) return null;
  return (
    <p role="alert" className="mt-6 flex max-w-xl items-start gap-2 rounded-md border border-urgent/40 bg-urgent/10 px-4 py-3 text-sm text-ink">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-urgent" />
      {MESSAGES[error] ?? FALLBACK}
    </p>
  );
}
