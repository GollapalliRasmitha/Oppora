"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Page state kept in the query string (survives reloads, back/forward,
 * shareable). Values equal to their default are removed from the URL.
 * Uses native history updates, which Next.js syncs into useSearchParams
 * without a navigation, so typing in a search box stays smooth.
 */
export function useUrlParams<K extends string>(defaults: Record<K, string>) {
  const params = useSearchParams();
  const keys = Object.keys(defaults) as K[];
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? defaults[k]])) as Record<K, string>;

  const set = useCallback(
    (patch: Partial<Record<K, string>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch) as [K, string | undefined][]) {
        if (v === undefined) continue;
        if (v && v !== defaults[k]) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    },
    // `defaults` is a literal per call site; its values never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params],
  );

  return [values, set] as const;
}
