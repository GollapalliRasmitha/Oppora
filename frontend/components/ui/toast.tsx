"use client";

import { Toaster as Sonner, toast as sonner } from "sonner";

/** Mounted once in the root layout. */
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      offset={{ bottom: 96, right: 24 }}
      mobileOffset={{ bottom: 148 }}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-md !border !border-line-strong !bg-surface/95 !text-ink !backdrop-blur-xl !shadow-[var(--shadow-pop)] !font-sans",
          description: "!text-ink-2",
          actionButton: "!bg-brand !text-white !font-semibold !rounded-sm",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-urgent",
        },
      }}
    />
  );
}

type Opts = { description?: string; action?: { label: string; onClick: () => void } };

/** Toasts with an action (e.g. Undo) stay longer so there's time to reach the button. */
const withTiming = (opts?: Opts) => (opts?.action ? { duration: 8000, ...opts } : opts);

/** Feedback after every user action. */
export const toast = {
  success: (msg: string, opts?: Opts) => sonner.success(msg, withTiming(opts)),
  error: (msg: string, opts?: Opts) => sonner.error(msg, withTiming(opts)),
  info: (msg: string, opts?: Opts) => sonner(msg, withTiming(opts)),
};
