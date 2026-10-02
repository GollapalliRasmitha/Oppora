import type { Metadata } from "next";
import { UpcomingPage } from "@/components/oppora/upcoming-page";

export const metadata: Metadata = { title: "Opportunity details" };

export default function Page() {
  return <UpcomingPage title="Opportunity details" subtitle="Everything Oppora found about this opportunity." />;
}
