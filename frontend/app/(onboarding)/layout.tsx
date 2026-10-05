import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";

/** Focused pages after sign-in (no app shell): the AI consent screen. */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ambient flex min-h-dvh items-center justify-center px-4 py-10">
      {children}
      <Toaster />
    </div>
  );
}
