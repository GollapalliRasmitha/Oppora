import type { Metadata } from "next";
import { OpportunityDetailView } from "./opportunity-detail-view";

export const metadata: Metadata = { title: "Opportunity details" };

export default async function OpportunityPage({ params }: PageProps<"/opportunities/[id]">) {
  const { id } = await params;
  // Keyed so navigating between opportunities resets local state (tabs, modal).
  return <OpportunityDetailView key={id} id={id} />;
}
