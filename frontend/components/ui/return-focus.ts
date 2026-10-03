"use client";

import { useRef } from "react";

/**
 * Radix dialogs return focus to their <Dialog.Trigger>. Ours are opened from
 * ordinary buttons (FAB, header, menu items), so remember whatever had focus
 * when the dialog opened and put focus back there when it closes.
 */
export function useReturnFocus() {
  const ref = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      ref.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onCloseAutoFocus: (e: Event) => {
      const el = ref.current;
      ref.current = null;
      if (el?.isConnected) {
        e.preventDefault();
        el.focus();
      }
    },
  };
}
