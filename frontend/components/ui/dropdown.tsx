"use client";

import { DropdownMenu } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Dropdown = DropdownMenu.Root;
export const DropdownTrigger = DropdownMenu.Trigger;

export function DropdownContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-48 rounded-md border border-line-strong bg-surface/95 p-1.5 shadow-[0_18px_48px_-12px_rgba(0,0,0,.7)] backdrop-blur-xl",
          "data-[state=open]:animate-fade-up",
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function DropdownItem({
  className,
  tone,
  ...props
}: ComponentProps<typeof DropdownMenu.Item> & { tone?: "danger" }) {
  return (
    <DropdownMenu.Item
      className={cn(
        "flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-sm px-3 text-sm font-medium text-ink-2 outline-none transition-colors [&_svg]:size-4 [&_svg]:text-ink-3",
        "data-[highlighted]:bg-white/[.07] data-[highlighted]:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        tone === "danger" && "text-urgent data-[highlighted]:text-urgent [&_svg]:text-urgent",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownSeparator({ className, ...props }: ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator className={cn("my-1 h-px bg-line", className)} {...props} />;
}
