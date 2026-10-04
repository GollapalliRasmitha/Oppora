"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { signOut } from "@/lib/api";

/** Ends the session on the server, then goes to the landing page. Shared by the header menu and Settings. */
export function useSignOut() {
  const router = useRouter();
  return useCallback(async () => {
    try {
      await signOut();
      toast.success("Signed out");
      router.push("/");
    } catch {
      toast.error("Couldn't sign you out. Please try again.");
    }
  }, [router]);
}
