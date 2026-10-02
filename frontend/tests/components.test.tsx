import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Bell, BriefcaseBusiness } from "lucide-react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DeadlineIndicator, MatchMeter, PriorityBadge } from "@/components/oppora/badges";
import { OpportunityRow } from "@/components/oppora/opportunity-row";
import { StatCard } from "@/components/oppora/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { createSeed } from "@/lib/mock/seed";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOW = new Date(2026, 9, 2, 9, 30);
const tcs = createSeed(NOW).opportunities.find((o) => o.id === "opp_tcs_codevita_2026")!;

describe("DeadlineIndicator", () => {
  it("writes the day count, not only colour", () => {
    render(<DeadlineIndicator deadline="2026-10-04" days={2} />);
    expect(screen.getByText("4 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("2 days left")).toHaveClass("text-urgent");
  });
});

describe("badges", () => {
  it("PriorityBadge labels the level", () => {
    render(<PriorityBadge priority="High" />);
    expect(screen.getByText("High Priority")).toBeInTheDocument();
  });
  it("MatchMeter exposes its value", () => {
    render(<MatchMeter value={92} />);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "92");
    expect(screen.getByText("92% Match")).toBeInTheDocument();
  });
});

describe("StatCard", () => {
  it("shows value, label and trend", () => {
    render(<StatCard icon={BriefcaseBusiness} value={12} label="Total Opportunities" trend="+2 this week" />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Total Opportunities")).toBeInTheDocument();
    expect(screen.getByText("+2 this week")).toBeInTheDocument();
  });
});

describe("IconButton", () => {
  it("applies its accessible name", () => {
    render(<IconButton label="Notifications" icon={<Bell />} />);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });
});

describe("states", () => {
  it("EmptyState renders its action", () => {
    render(<EmptyState icon={BriefcaseBusiness} title="Nothing yet" description="desc" action={<button>Scan Gmail</button>} />);
    expect(screen.getByRole("button", { name: "Scan Gmail" })).toBeInTheDocument();
  });
  it("ErrorState offers a retry", async () => {
    const retry = vi.fn();
    render(<ErrorState description="Network down" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Network down");
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("OpportunityRow", () => {
  it("shows title, company · type, deadline and an accessible actions menu", async () => {
    const actions = { onToggleSave: vi.fn(), onApply: vi.fn(), onRemind: vi.fn(), onDismiss: vi.fn() };
    render(
      <ul>
        <OpportunityRow opp={tcs} now={NOW} actions={actions} />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "TCS CodeVita 2026" })).toHaveAttribute("href", "/opportunities/opp_tcs_codevita_2026");
    expect(screen.getByText("TCS · Hackathon")).toBeInTheDocument();
    expect(screen.getAllByText("2 days left").length).toBeGreaterThan(0);
    expect(screen.getByText("In progress")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions for TCS CodeVita 2026" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /mark as applied/i }));
    expect(actions.onApply).toHaveBeenCalledWith(tcs);
  });
});
