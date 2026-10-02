"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type SwipeAction = {
  label: string;
  icon: ReactNode;
  /** Tailwind classes for the revealed background. */
  className: string;
  onTrigger: () => void;
};

const THRESHOLD = 80;
const MAX = 120;

/**
 * Touch swipe for list items: swipe right → `right` action, swipe left →
 * `left` action. Mouse input is ignored, and the same actions must also be
 * available as buttons (swiping is a shortcut, never the only way).
 */
export function Swipeable({
  children,
  right,
  left,
  className,
}: {
  children: ReactNode;
  right?: SwipeAction;
  left?: SwipeAction;
  className?: string;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number; active: boolean } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(my) > Math.abs(mx) || Math.abs(mx) < 8) return; // vertical scroll wins
      s.active = true;
      try {
        // Keeps receiving moves if the finger leaves the row; optional.
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already released — the swipe still works without capture */
      }
    }
    const allowed = Math.max(left ? -MAX : 0, Math.min(right ? MAX : 0, mx));
    setDx(allowed);
  };

  const end = () => {
    const s = start.current;
    start.current = null;
    if (s?.active) {
      if (dx >= THRESHOLD) right?.onTrigger();
      else if (dx <= -THRESHOLD) left?.onTrigger();
    }
    setDx(0);
  };

  const revealed = dx > 0 ? right : dx < 0 ? left : undefined;
  const armed = Math.abs(dx) >= THRESHOLD;

  return (
    <div className={cn("relative overflow-hidden rounded-md", className)}>
      {revealed && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center px-5 text-sm font-bold transition-opacity",
            dx > 0 ? "justify-start" : "justify-end",
            revealed.className,
            armed ? "opacity-100" : "opacity-60",
          )}
        >
          <span className="flex items-center gap-2 [&_svg]:size-5">
            {revealed.icon}
            {revealed.label}
          </span>
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        className={cn("relative touch-pan-y", dx === 0 && "transition-transform duration-200")}
      >
        {children}
      </div>
    </div>
  );
}
