import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-11 w-full rounded-md border border-line bg-tint/[.04] px-4 text-[15px] text-ink placeholder:text-ink-3 outline-none transition-[border-color,box-shadow,background-color] duration-200 focus:border-violet/70 focus:bg-tint/[.06] focus:shadow-[0_0_0_4px_rgba(124,58,237,.18),0_0_24px_-6px_rgba(96,165,250,.45)]";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}
