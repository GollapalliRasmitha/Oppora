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
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function Modal({ open, onOpenChange, title, description, children, footer, className }: Props) {
  const focus = useReturnFocus();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-up" />
        <Dialog.Content
          {...focus}
          className={cn(
            "glass-strong fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-card bg-surface/90 p-6 focus:outline-none data-[state=open]:animate-fade-up",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-ink">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-sm text-ink-2">{description}</Dialog.Description>}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-mr-2 -mt-2 inline-flex size-11 items-center justify-center rounded-md text-ink-3 focus-ring hover:bg-white/[.06] hover:text-ink"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
