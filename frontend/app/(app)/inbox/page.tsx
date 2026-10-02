import type { Metadata } from "next";
import { Suspense } from "react";
import { InboxView } from "./inbox-view";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense>
      <InboxView />
    </Suspense>
  );
}
