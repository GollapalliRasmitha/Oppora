import type { Metadata } from "next";
import { SimplePage } from "@/components/landing/simple-page";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <SimplePage title="Contact">
      <p>A contact address will be listed here soon.</p>
    </SimplePage>
  );
}
