import { MailWarning } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError, GMAIL_ERROR } from "@/lib/api/client";

/**
 * The one error state for a page that failed to load. Gmail-access errors get
 * the brief's copy and a Reconnect action; everything else gets a retry.
 */
export function LoadError({ error, title, onRetry }: { error: Error; title: string; onRetry: () => void }) {
  if (error instanceof ApiError && error.code === "gmail") {
    return (
      <ErrorState
        icon={MailWarning}
        title="Gmail disconnected"
        description={GMAIL_ERROR}
        action={
          <Button asChild>
            <Link href="/settings#gmail">Reconnect Gmail</Link>
          </Button>
        }
      />
    );
  }
  return <ErrorState title={title} description={error.message} onRetry={onRetry} />;
}
