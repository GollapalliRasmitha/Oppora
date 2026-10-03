"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useReturnFocus } from "./return-focus";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Icon or mark shown before the title. */
  icon?: ReactNode;
  description?: string;
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * Right-side panel on tablet/desktop; a full-screen sheet on mobile.
 */
export function Drawer({ open, onOpenChange, title, icon, description, headerExtra, children, footer, className }: Props) {
  const focus = useReturnFocus();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-fade-up" />
        <Dialog.Content
          {...focus}
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-surface/95 backdrop-blur-xl focus:outline-none sm:inset-y-3 sm:left-auto sm:right-3 sm:w-[420px] sm:rounded-card sm:border sm:border-line-strong sm:shadow-[0_24px_64px_-16px_rgba(0,0,0,.8)]",
            "data-[state=open]:animate-drawer-in",
            className,
          )}
        >
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            {icon}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-bold text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-meta text-ink-3">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">Panel</Dialog.Description>
              )}
            </div>
            {headerExtra}
            <Dialog.Close
              aria-label="Close panel"
              className="inline-flex size-11 items-center justify-center rounded-md text-ink-3 focus-ring hover:bg-white/[.06] hover:text-ink"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="border-t border-line p-4">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
