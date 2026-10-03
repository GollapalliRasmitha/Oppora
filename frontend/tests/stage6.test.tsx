import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { InsightCard } from "@/components/oppora/insight-card";
import { LoadError } from "@/components/oppora/load-error";
import { StatCard } from "@/components/oppora/stat-card";
import { Drawer } from "@/components/ui/drawer";
import { ApiError, GMAIL_ERROR } from "@/lib/api/client";
import { filterByView, parseView } from "@/lib/domain/opportunities";
import { createSeed } from "@/lib/mock/seed";
import { BriefcaseBusiness, Layers } from "lucide-react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOW = new Date(2026, 9, 2, 9, 30);
const seed = createSeed(NOW);

describe("opportunities Show filter (Saved / Applications)", () => {
  it("matches the dashboard numbers", () => {
    expect(filterByView(seed.opportunities, "all")).toHaveLength(12);
    expect(filterByView(seed.opportunities, "saved")).toHaveLength(7);
    expect(filterByView(seed.opportunities, "in_progress")).toHaveLength(3);
    expect(filterByView(seed.opportunities, "applied")).toHaveLength(8);
  });

  it("falls back to all for unknown values", () => {
    expect(parseView("applied")).toBe("applied");
    expect(parseView("bogus")).toBe("all");
    expect(parseView(null)).toBe("all");
  });
});

describe("LoadError", () => {
  it("offers Reconnect Gmail for Gmail-access errors", () => {
    render(<LoadError title="Couldn't load" error={new ApiError(GMAIL_ERROR, "gmail")} onRetry={() => {}} />);
    expect(screen.getByRole("heading", { name: "Gmail disconnected" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reconnect Gmail" })).toHaveAttribute("href", "/settings#gmail");
  });

  it("offers Sign in again when the session expired", () => {
    render(<LoadError title="Couldn't load" error={new ApiError("Your session has expired. Sign in again to continue.", "auth")} onRetry={() => {}} />);
    expect(screen.getByRole("heading", { name: "You've been signed out" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/");
  });

  it("offers a retry for other errors", async () => {
    const onRetry = vi.fn();
    render(<LoadError title="Couldn't load your inbox" error={new ApiError("Network down")} onRetry={onRetry} />);
    expect(screen.getByRole("heading", { name: "Couldn't load your inbox" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("StatCard", () => {
  it("links the whole card when given an href", () => {
    render(<StatCard icon={BriefcaseBusiness} value={8} label="Applied" trend="+1 this week" href="/opportunities?show=applied" />);
    expect(screen.getByRole("link", { name: "Applied" })).toHaveAttribute("href", "/opportunities?show=applied");
  });
});

describe("InsightCard", () => {
  it("shows the full value (never truncated)", () => {
    render(<InsightCard icon={Layers} label="Most Common Category" value="Internships (33%)" detail="4 of 12" />);
    expect(screen.getByText("Internships (33%)")).not.toHaveClass("truncate");
  });
});

describe("Drawer", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open AI
        </button>
        <Drawer open={open} onOpenChange={setOpen} title="Oppora AI">
          <p>Body</p>
        </Drawer>
      </>
    );
  }

  it("returns focus to the button that opened it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open AI" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Open AI" })).toHaveFocus());
  });
});
