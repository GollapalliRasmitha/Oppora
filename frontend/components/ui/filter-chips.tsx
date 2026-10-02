"use client";

import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/utils";

export type ChipOption<T extends string> = { value: T; label: string; count?: number };

type Props<T extends string> = {
  options: ChipOption<T>[];
  value: T;
  onValueChange: (v: T) => void;
  label: string;
  className?: string;
};

/** Single-select chip row. Counts are computed by the caller from data. */
export function FilterChips<T extends string>({ options, value, onValueChange, label, className }: Props<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      className={cn("flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-line bg-white/[.03] px-4 text-sm font-semibold text-ink-2 focus-ring transition-[background-color,border-color,color,box-shadow] duration-200 hover:border-line-strong hover:text-ink",
            "data-[state=on]:border-transparent data-[state=on]:bg-brand data-[state=on]:text-white data-[state=on]:shadow-[var(--glow-brand)]",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="text-xs font-medium opacity-80">({o.count})</span>}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
