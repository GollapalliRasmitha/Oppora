import Link from "next/link";
import { Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHeader } from "./page-header";

/** Temporary body for routes scheduled in a later build stage. */
export function UpcomingPage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <GlassCard>
        <EmptyState
          icon={Hammer}
          title="This page is on its way"
          description={`${title} is being built in an upcoming stage. Your dashboard has everything Oppora has found so far.`}
          action={
            <Button asChild variant="secondary">
              <Link href="/dashboard">Back to Home</Link>
            </Button>
          }
        />
      </GlassCard>
    </>
  );
}
