import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Footer } from "./sections";
import { Navbar } from "./navbar";

export function SimplePage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ambient flex min-h-dvh flex-col">
      <Navbar />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-4">
          <Link href="/">
            <ArrowLeft aria-hidden /> Back
          </Link>
        </Button>
        <h1 className="text-section font-extrabold tracking-tight text-ink">{title}</h1>
        <GlassCard className="mt-6 space-y-4 p-6 text-body leading-relaxed text-ink-2 sm:p-8">{children}</GlassCard>
      </main>
      <Footer />
    </div>
  );
}
