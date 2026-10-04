import type { ReactNode } from "react";
import { AppShell } from "@/components/oppora/app-shell";
import { Toaster } from "@/components/ui/toast";

export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      {/* Only signed-in pages toast, so the landing page doesn't load the toast library. */}
      <Toaster />
    </>
  );
}
