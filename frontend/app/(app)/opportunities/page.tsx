import type { Metadata } from "next";
import { UpcomingPage } from "@/components/oppora/upcoming-page";

export const metadata: Metadata = { title: "Opportunities" };

export default function Page() {
  return <UpcomingPage title="Opportunities" subtitle="All the opportunities found from your Gmail, sorted by relevance." />;
}
