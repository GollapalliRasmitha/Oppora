import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Abstract orbital mark with a small sparkle. Decorative; pair with the
 * wordmark or an aria-label. Gradient ids are unique per instance: if two
 * marks shared ids and the first sat in a hidden (display:none) subtree —
 * like the sidebar on mobile — the orbit would not render.
 */
export function LogoMark({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const orbit = `oppora-orbit-${uid}`;
  const core = `oppora-core-${uid}`;
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden className={cn("size-8", className)}>
      <defs>
        <linearGradient id={orbit} x1="4" y1="30" x2="36" y2="8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C3AED" />
          <stop offset=".55" stopColor="#60A5FA" />
          <stop offset="1" stopColor="#F472B6" />
        </linearGradient>
        <radialGradient id={core} cx="0" cy="0" r="1" gradientTransform="translate(19 21) rotate(90) scale(10)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" />
          <stop offset=".5" stopColor="#C4B5FD" />
          <stop offset="1" stopColor="#7C3AED" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="20" cy="21" rx="16.5" ry="8.5" transform="rotate(-28 20 21)" stroke={`url(#${orbit})`} strokeWidth="3.2" strokeLinecap="round" strokeDasharray="78 12" />
      <circle cx="19" cy="21" r="8" fill={`url(#${core})`} opacity=".55" />
      <path d="M19 12.5c.7 4.6 2.4 6.6 6.8 7.6-4.4 1-6.1 3-6.8 7.6-.7-4.6-2.4-6.6-6.8-7.6 4.4-1 6.1-3 6.8-7.6Z" style={{ fill: "var(--logo-star)" }} />
      <path d="M31 5.5c.3 1.8 1 2.5 2.7 2.9-1.7.4-2.4 1.1-2.7 2.9-.3-1.8-1-2.5-2.7-2.9 1.7-.4 2.4-1.1 2.7-2.9Z" style={{ fill: "var(--logo-star-2)" }} />
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={size === "lg" ? "size-10" : "size-8"} />
      <span className={cn("font-extrabold tracking-tight text-ink", size === "lg" ? "text-2xl" : "text-lg")}>Oppora</span>
    </span>
  );
}
