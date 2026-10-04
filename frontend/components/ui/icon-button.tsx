import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<"button">, "aria-label" | "children"> & {
  /** Required accessible name — icon-only buttons have no visible text. */
  label: string;
  icon: ReactNode;
  variant?: "ghost" | "glass";
  /** Shows a small unread dot in the top-right corner. */
  dot?: boolean;
};

export function IconButton({ label, icon, variant = "ghost", dot, className, type = "button", ...props }: Props) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-2 focus-ring transition-colors duration-200 hover:text-ink [&_svg]:size-5",
        variant === "ghost" && "hover:bg-tint/[.06]",
        variant === "glass" && "glass hover:border-line-strong",
        className,
      )}
      {...props}
    >
      {icon}
      {dot && <span aria-hidden className="absolute right-2.5 top-2.5 size-2 rounded-full bg-pink ring-2 ring-bg" />}
    </button>
  );
}
