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
            "!rounded-md !border !border-line-strong !bg-surface/95 !text-ink !backdrop-blur-xl !shadow-[0_18px_48px_-12px_rgba(0,0,0,.7)] !font-sans",
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

/** Feedback after every user action. */
export const toast = {
  success: (msg: string, opts?: Opts) => sonner.success(msg, opts),
  error: (msg: string, opts?: Opts) => sonner.error(msg, opts),
  info: (msg: string, opts?: Opts) => sonner(msg, opts),
};
