import type { Metadata } from "next";
import { SimplePage } from "@/components/landing/simple-page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <SimplePage title="Privacy">
      <p>Our full privacy policy is being written. Here is how Oppora is designed to handle your data:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>Oppora asks only for read-only Gmail access plus your basic profile and email. It never asks for your Gmail password.</li>
        <li>
          It stores only what it needs: the message ID, sender, subject, date, a short snippet and the opportunity details it
          extracts. Full email bodies are not kept after processing.
        </li>
        <li>You can disconnect Gmail at any time, which revokes access and deletes the stored tokens.</li>
      </ul>
    </SimplePage>
  );
}
