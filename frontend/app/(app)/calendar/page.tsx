import type { Metadata } from "next";
import { UpcomingPage } from "@/components/oppora/upcoming-page";

export const metadata: Metadata = { title: "Calendar" };

export default function Page() {
  return <UpcomingPage title="Calendar" subtitle="Deadlines, interviews and events in one view." />;
}
