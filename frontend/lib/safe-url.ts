/**
 * Links that come from data (emails, the assistant) are checked before they're
 * rendered: external links must be http(s) (never `javascript:` or `data:`),
 * and assistant links must stay inside the app.
 */

export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** "/opportunities/…" or "/inbox?q=…", not "//evil.example" or "/\evil". */
export function isInternalHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\");
}
