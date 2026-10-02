import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "border-line bg-white/[.04] text-ink-2",
        purple: "border-violet/30 bg-purple/15 text-violet",
        blue: "border-blue/30 bg-blue/10 text-blue",
        pink: "border-pink/30 bg-pink/10 text-pink",
        success: "border-success/30 bg-success/10 text-success",
        urgent: "border-urgent/35 bg-urgent/10 text-urgent",
        soon: "border-soon/35 bg-soon/10 text-soon",
        later: "border-later/35 bg-later/10 text-later",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
