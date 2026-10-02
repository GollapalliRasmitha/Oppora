import type { Metadata } from "next";
import { UpcomingPage } from "@/components/oppora/upcoming-page";

export const metadata: Metadata = { title: "Deadlines" };

export default function Page() {
  return <UpcomingPage title="Deadlines" subtitle="Stay on top of your important dates." />;
}
