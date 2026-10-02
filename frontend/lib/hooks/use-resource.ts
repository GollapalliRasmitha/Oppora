"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type ResourceState<T> =
  | { status: "loading"; data: undefined; error: undefined }
  | { status: "error"; data: undefined; error: Error }
  | { status: "success"; data: T; error: undefined };

const LOADING = { status: "loading", data: undefined, error: undefined } as const;

/** Loads data from a service function and exposes loading / error / retry. */
export function useResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<ResourceState<T>>(LOADING);
  const [version, setVersion] = useState(0);
  const loadRef = useRef(load);
  const silent = useRef(false);
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ status: "success", data, error: undefined });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        // A failed background refresh keeps the data already on screen.
        setState((s) => (silent.current && s.status === "success" ? s : { status: "error", data: undefined, error }));
      })
      .finally(() => {
        silent.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => {
    silent.current = false;
    setState(LOADING);
    setVersion((v) => v + 1);
  }, []);

  /** Refetch in the background, keeping the current data on screen. */
  const revalidate = useCallback(() => {
    silent.current = true;
    setVersion((v) => v + 1);
  }, []);

  /** Local optimistic update of loaded data. */
  const mutate = useCallback((fn: (prev: T) => T) => {
    setState((s) => (s.status === "success" ? { ...s, data: fn(s.data) } : s));
  }, []);

  return { ...state, reload, revalidate, mutate };
}
