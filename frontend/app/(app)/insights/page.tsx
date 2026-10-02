import type { Metadata } from "next";
import { UpcomingPage } from "@/components/oppora/upcoming-page";

export const metadata: Metadata = { title: "AI Insights" };

export default function Page() {
  return <UpcomingPage title="AI Insights" subtitle="Your personalized insights based on Gmail analysis." />;
}
