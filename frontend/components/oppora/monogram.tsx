import { cn } from "@/lib/utils";

/** Colour pairs for company tiles. No real logos — a first-letter monogram instead. */
const PALETTE = [
  "from-[#7c3aed] to-[#4f46e5]",
  "from-[#2563eb] to-[#0ea5e9]",
  "from-[#db2777] to-[#9333ea]",
  "from-[#0d9488] to-[#2563eb]",
  "from-[#c2410c] to-[#db2777]",
  "from-[#4f46e5] to-[#db2777]",
];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function Monogram({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-gradient-to-br font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25)] ring-1 ring-white/10",
        PALETTE[hash(name) % PALETTE.length],
        size === "sm" && "size-8 text-sm",
        size === "md" && "size-11 text-lg",
        size === "lg" && "size-14 text-2xl",
        className,
      )}
    >
      {letter}
    </span>
  );
}
