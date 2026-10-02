import type { Metadata } from "next";
import { SimplePage } from "@/components/landing/simple-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <SimplePage title="Terms">
      <p>Our terms of service are being written and will be published here before Oppora opens to the public.</p>
    </SimplePage>
  );
}
