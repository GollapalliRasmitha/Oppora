import type { Metadata } from "next";
import { UpcomingPage } from "@/components/oppora/upcoming-page";

export const metadata: Metadata = { title: "Inbox" };

export default function Page() {
  return <UpcomingPage title="Inbox" subtitle="Relevant emails from your Gmail." />;
}
