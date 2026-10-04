import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-11 w-full rounded-md border border-line bg-tint/[.04] px-4 text-body text-ink placeholder:text-ink-3 outline-none transition-[border-color,box-shadow,background-color] duration-200 focus:border-violet/70 focus:bg-tint/[.06] focus:shadow-[var(--focus-halo)]";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}
