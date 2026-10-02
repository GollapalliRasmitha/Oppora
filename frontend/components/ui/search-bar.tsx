"use client";

import { Search, X } from "lucide-react";
import { useId, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { inputClass } from "./input";

type Props = Omit<ComponentProps<"input">, "onChange" | "value" | "type"> & {
  value: string;
  onValueChange: (v: string) => void;
  /** Visually hidden label for screen readers. */
  label: string;
};

export function SearchBar({ value, onValueChange, label, className, id, ...props }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div role="search" className={cn("group relative w-full", className)}>
      <label className="sr-only" htmlFor={inputId}>
        {label}
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3 transition-colors group-focus-within:text-violet"
      />
      <input
        id={inputId}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(inputClass, "pl-10 pr-10 text-sm [&::-webkit-search-cancel-button]:hidden")}
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onValueChange("")}
          className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-sm text-ink-3 focus-ring hover:text-ink"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
