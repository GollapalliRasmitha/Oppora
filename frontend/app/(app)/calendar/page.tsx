import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense>
      <CalendarView />
    </Suspense>
  );
}
