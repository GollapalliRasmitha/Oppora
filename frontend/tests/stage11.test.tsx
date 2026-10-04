import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { IntentLink } from "@/components/ui/intent-link";

// Records the prefetch prop the real Link would receive.
vi.mock("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: unknown; children: ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

// The lazy panels: stand-ins for the dynamically imported modules.
vi.mock("next/dynamic", () => ({
  default: () =>
    function Panel() {
      return <div role="dialog" aria-label="Lazy panel" />;
    },
}));

// The idle prefetch imports the real panel modules; stub them so nothing loads after teardown.
vi.mock("@/components/oppora/ai-assistant", () => ({ AIAssistantPanel: () => null }));
vi.mock("@/components/oppora/notifications-panel", () => ({ NotificationsPanel: () => null }));

let assistantOpen = false;
vi.mock("@/components/oppora/shell-context", () => ({ useShell: () => ({ assistantOpen }) }));

describe("IntentLink", () => {
  it("does not prefetch on render, then prefetches once the user shows intent", () => {
    render(<IntentLink href="/deadlines">Deadlines</IntentLink>);
    const a = screen.getByRole("link", { name: "Deadlines" });
    expect(a).toHaveAttribute("data-prefetch", "false");
    fireEvent.mouseEnter(a);
    expect(a).toHaveAttribute("data-prefetch", "null"); // Next's default prefetch
  });

  it("keyboard focus and touch also count as intent, and handlers still run", () => {
    const onFocus = vi.fn();
    render(
      <>
        <IntentLink href="/inbox" onFocus={onFocus}>
          Inbox
        </IntentLink>
        <IntentLink href="/calendar">Calendar</IntentLink>
      </>,
    );
    const inbox = screen.getByRole("link", { name: "Inbox" });
    fireEvent.focus(inbox);
    expect(inbox).toHaveAttribute("data-prefetch", "null");
    expect(onFocus).toHaveBeenCalled();
    const cal = screen.getByRole("link", { name: "Calendar" });
    fireEvent.touchStart(cal);
    expect(cal).toHaveAttribute("data-prefetch", "null");
  });
});

describe("lazy panels", () => {
  it("the assistant panel isn't mounted until first opened, then stays mounted", async () => {
    vi.useFakeTimers();
    const { LazyAIAssistantPanel } = await import("@/components/oppora/lazy-panels");
    assistantOpen = false;
    const { rerender } = render(<LazyAIAssistantPanel />);
    expect(screen.queryByRole("dialog")).toBeNull();
    assistantOpen = true;
    rerender(<LazyAIAssistantPanel />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    assistantOpen = false;
    rerender(<LazyAIAssistantPanel />);
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // the conversation survives closing
    act(() => vi.runOnlyPendingTimers());
    vi.useRealTimers();
  });

  it("the notifications panel mounts on open", async () => {
    const { LazyNotificationsPanel } = await import("@/components/oppora/lazy-panels");
    const state = {} as Parameters<typeof LazyNotificationsPanel>[0]["state"];
    const { rerender } = render(<LazyNotificationsPanel open={false} onOpenChange={() => {}} state={state} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<LazyNotificationsPanel open onOpenChange={() => {}} state={state} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
