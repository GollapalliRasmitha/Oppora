"use client";

import { Switch as RadixSwitch } from "radix-ui";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Labelled on/off setting. The whole row is the 44px+ click target; the
 * label and optional description are wired to the switch for screen readers.
 */
export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  icon,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("flex min-h-14 items-center gap-3 py-2", disabled && "opacity-60")}>
      {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/[.05] text-ink-2 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block cursor-pointer text-sm font-semibold text-ink">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-meta text-ink-3">
            {description}
          </p>
        )}
      </div>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${id}-desc` : undefined}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-line-strong bg-white/[.08] focus-ring transition-colors duration-200",
          "after:absolute after:-inset-2 after:content-['']",
          "data-[state=checked]:border-transparent data-[state=checked]:bg-brand data-[state=checked]:shadow-[var(--glow-soft)]",
        )}
      >
        <RadixSwitch.Thumb className="block size-5 translate-x-1 rounded-full bg-ink shadow transition-transform duration-200 data-[state=checked]:translate-x-6" />
      </RadixSwitch.Root>
    </div>
  );
}
