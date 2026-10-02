import type { Metadata } from "next";
import { Suspense } from "react";
import { OpportunitiesView } from "./opportunities-view";

export const metadata: Metadata = { title: "Opportunities" };

export default function OpportunitiesPage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense>
      <OpportunitiesView />
    </Suspense>
  );
}
