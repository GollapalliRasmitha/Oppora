import type { Metadata } from "next";
import { Suspense } from "react";
import { WelcomeView } from "./welcome-view";

export const metadata: Metadata = { title: "Before Oppora reads your Gmail" };

export default function WelcomePage() {
  // useSearchParams (the ?next= page) needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={null}>
      <WelcomeView />
    </Suspense>
  );
}
