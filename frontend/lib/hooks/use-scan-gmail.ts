"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { ApiError, startSync } from "@/lib/api";
import type { SyncStatus } from "@/lib/domain/types";

/**
 * "Scan Gmail" used by every empty state and the sync status. Shows the
 * brief's Gmail-error copy with a Reconnect action when Gmail isn't connected.
 */
export function useScanGmail() {
  const router = useRouter();
  return useCallback(async (): Promise<SyncStatus | null> => {
    try {
      const status = await startSync();
      toast.info("Oppora AI is analyzing your Gmail…", { description: "Finding opportunities relevant to you." });
      return status;
    } catch (e) {
      if (e instanceof ApiError && e.code === "gmail") {
        toast.error("Couldn't access your Gmail. Reconnect your account to continue.", {
          action: { label: "Reconnect Gmail", onClick: () => router.push("/settings#gmail") },
        });
      } else {
        toast.error("Couldn't start the scan. Check your connection and try again.");
      }
      return null;
    }
  }, [router]);
}
