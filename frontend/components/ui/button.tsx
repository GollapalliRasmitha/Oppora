import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Every button keeps a ≥44px touch target. `sm` is visually 36px and
 * extends its hit area with an invisible ::after.
 */
export const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold focus-ring transition-[transform,box-shadow,background-color,border-color,color] duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-white shadow-[0_6px_20px_-8px_rgba(124,58,237,.7)] hover:-translate-y-px hover:shadow-[var(--glow-brand)] active:translate-y-0",
        secondary:
          "border border-line-strong bg-glass-strong text-ink hover:border-violet/60 hover:bg-white/[.09]",
        ghost: "text-ink-2 hover:bg-white/[.06] hover:text-ink",
        danger: "border border-urgent/40 text-urgent hover:bg-urgent/10",
      },
      size: {
        sm: "h-9 px-3.5 text-sm after:absolute after:-inset-1 after:content-['']",
        md: "h-11 px-5 text-[15px]",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...(!asChild && { type: type ?? "button" })}
      {...props}
    />
  );
}
