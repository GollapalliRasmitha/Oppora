import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SimplePage } from "@/components/landing/simple-page";

export const metadata: Metadata = { title: "Privacy" };

function H({ children }: { children: ReactNode }) {
  return <h2 className="pt-2 text-lg font-bold text-ink">{children}</h2>;
}

const linkClass = "font-semibold text-violet underline-offset-2 hover:underline focus-ring rounded-sm";

export default function PrivacyPage() {
  return (
    <SimplePage title="Privacy">
      <p>
        Oppora is a personal portfolio project, currently in Google&apos;s testing phase: only invited Google accounts can connect
        Gmail. This page explains exactly what happens to your data.
      </p>

      <H>Your emails are processed by Google&apos;s Gemini (free tier)</H>
      <p>
        To find opportunities, Oppora sends emails that look relevant to <strong className="text-ink">Google&apos;s Gemini AI</strong>{" "}
        through its <strong className="text-ink">free tier</strong>. For each of those emails it sends only:
      </p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>the subject, the sender&apos;s display name and email domain (not the address), and the date;</li>
        <li>the email&apos;s text, cleaned up (quoted replies and signatures removed) and cut to 4,000 characters.</li>
      </ul>
      <p>
        <strong className="text-ink">Personal details are removed first:</strong> email addresses, phone numbers, OTPs and
        verification codes, the secret parts of sign-in, reset and verification links, and your name are replaced with
        placeholders before anything is sent.
      </p>
      <p>
        Attachments are never read or sent. Promotions, chats, your own sent mail and emails without opportunity-related words are
        filtered out first and never sent to the AI.
      </p>
      <p>
        <strong className="text-ink">What the free tier means:</strong> under Google&apos;s{" "}
        <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" className={linkClass}>
          Gemini API terms
        </a>
        , Google may use content sent to its free services to improve its products, and human reviewers may read it. Google asks
        users not to send sensitive, confidential or personal information to the free tier. Only connect a mailbox you&apos;re
        comfortable with this for, or use the demo instead.
      </p>
      <p>
        <strong className="text-ink">You choose.</strong> After you sign in, Oppora asks before it scans anything. Choose{" "}
        <em>Use without AI</em> and it reads your emails with simple rules on its own server: nothing is sent to an AI (it&apos;s
        less thorough). You can switch anytime in Settings → Privacy.
      </p>

      <H>What Oppora reads and keeps</H>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          Read-only Gmail access (<code className="text-ink">gmail.readonly</code>) plus your basic profile and email address. Oppora
          can&apos;t send, change or delete email, and never sees your Google password.
        </li>
        <li>
          For relevant emails it stores the message ID, sender, subject, date, a short snippet and the opportunity details it
          extracts. Full email bodies are never stored.
        </li>
        <li>Google sign-in tokens are encrypted and never sent to your browser.</li>
      </ul>

      <H>Where it&apos;s stored</H>
      <p>
        The website runs on Vercel, the API on Render, the database on Neon (Postgres) and rate-limit counters on Upstash (Redis;
        no email content). All of them are used on their free plans.
      </p>

      <H>Your controls</H>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong className="text-ink">Disconnect Gmail</strong> (Settings → Gmail) revokes Oppora&apos;s access at Google and deletes
          the stored tokens.
        </li>
        <li>
          <strong className="text-ink">Delete my data</strong> (Settings → Account) deletes your opportunities, emails and
          notifications and disconnects Gmail.
        </li>
        <li>
          You can also remove Oppora at{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className={linkClass}>
            Google Account → Third-party connections
          </a>
          .
        </li>
      </ul>

      <H>The demo</H>
      <p>
        &ldquo;Try the demo&rdquo; opens a shared, read-only account filled with made-up sample emails. Nothing you do there is saved,
        and no real person&apos;s email is involved.
      </p>

      <p className="pt-2">
        Questions? See <Link href="/contact" className={linkClass}>Contact</Link>.
      </p>
    </SimplePage>
  );
}
