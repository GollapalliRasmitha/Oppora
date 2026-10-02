import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-md bg-[linear-gradient(90deg,rgba(255,255,255,.04)_25%,rgba(167,139,250,.10)_50%,rgba(255,255,255,.04)_75%)] bg-[length:200%_100%]",
        className,
      )}
      {...props}
    />
  );
}
