"use client";

import { Tabs as RadixTabs } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn("flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "relative -mb-px h-11 shrink-0 px-4 text-sm font-semibold text-ink-3 focus-ring transition-colors hover:text-ink",
        "data-[state=active]:text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand after:opacity-0 after:transition-opacity data-[state=active]:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}
