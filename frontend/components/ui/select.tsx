"use client";

import { Select as RadixSelect } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props<T extends string> = {
  value: T;
  onValueChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  /** Text shown before the value, e.g. "Sort:" */
  prefix?: string;
  className?: string;
};

export function Select<T extends string>({ value, onValueChange, options, label, prefix, className }: Props<T>) {
  return (
    <RadixSelect.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <RadixSelect.Trigger
        aria-label={label}
        className={cn(
          "inline-flex h-11 min-w-0 items-center gap-2 rounded-md border border-line bg-tint/[.04] px-4 text-sm font-semibold text-ink focus-ring transition-colors hover:border-line-strong",
          className,
        )}
      >
        {prefix && <span className="shrink-0 font-medium text-ink-3">{prefix}</span>}
        {/* min-w-0 + truncate: the trigger can shrink to its container instead of overflowing */}
        <span className="min-w-0 truncate">
          <RadixSelect.Value />
        </span>
        <RadixSelect.Icon className="ml-auto shrink-0">
          <ChevronDown aria-hidden className="size-4 text-ink-3" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="z-50 min-w-[var(--radix-select-trigger-width)] rounded-md border border-line-strong bg-surface/95 p-1.5 shadow-[var(--shadow-pop)] backdrop-blur-xl"
        >
          <RadixSelect.Viewport>
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={o.value}
                className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-3 rounded-sm px-3 text-sm font-medium text-ink-2 outline-none data-[highlighted]:bg-tint/[.07] data-[highlighted]:text-ink"
              >
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator>
                  <Check aria-hidden className="size-4 text-violet" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
