import type { ComponentProps, ElementType } from "react";
import { cn } from "@/lib/utils";

type Props<T extends ElementType> = {
  as?: T;
  /** Lifts slightly on hover — use for cards that are clickable. */
  interactive?: boolean;
  strong?: boolean;
} & Omit<ComponentProps<T>, "as">;

export function GlassCard<T extends ElementType = "div">({
  as,
  interactive,
  strong,
  className,
  ...props
}: Props<T>) {
  const Comp: ElementType = as ?? "div";
  return (
    <Comp
      className={cn(
        "rounded-card",
        strong ? "glass-strong" : "glass",
        interactive &&
          "transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--glow-soft)]",
        className,
      )}
      {...props}
    />
  );
}
