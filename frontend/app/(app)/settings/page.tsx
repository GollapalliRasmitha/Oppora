import type { Metadata } from "next";
import { UpcomingPage } from "@/components/oppora/upcoming-page";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <UpcomingPage title="Settings" subtitle="Manage your account and preferences." />;
}
