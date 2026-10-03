import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DeadlineIndicator, FeeBadge, formatFee } from "@/components/oppora/badges";
import { OpportunityCard } from "@/components/oppora/opportunity-card";
import { createSeed } from "@/lib/mock/seed";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOW = new Date(2026, 9, 2, 9, 30);
const seed = createSeed(NOW);

describe("fee warning", () => {
  it("formats the amount the email stated", () => {
    expect(formatFee({ amount: 500, currency: "INR", text: "x" })).toBe("₹500");
    expect(formatFee({ amount: 1499, currency: "INR", text: "x" })).toBe("₹1,499");
    expect(formatFee({ amount: 20, currency: "USD", text: "x" })).toBe("$20");
    expect(formatFee({ amount: 300, currency: "AED", text: "x" })).toBe("AED 300");
    expect(formatFee({ amount: null, currency: null, text: "x" })).toBe("");
  });

  it("shows a clear badge, with the email's own sentence on hover", () => {
    const { rerender } = render(<FeeBadge fee={{ amount: 500, currency: "INR", text: "Pay a registration fee of Rs. 500/-." }} />);
    const badge = screen.getByText("Asks for a fee: ₹500");
    expect(badge.closest("span")).toHaveAttribute("title", "From the email: “Pay a registration fee of Rs. 500/-.”");
    rerender(<FeeBadge fee={{ amount: null, currency: null, text: "A nominal fee applies." }} />);
    expect(screen.getByText("Asks for a fee")).toBeInTheDocument();
    rerender(<FeeBadge fee={null} />);
    expect(screen.queryByText(/Asks for a fee/)).toBeNull();
  });
});

describe("no deadline", () => {
  it("is said once", () => {
    render(<DeadlineIndicator deadline={null} days={null} />);
    expect(screen.getAllByText(/No deadline/)).toHaveLength(1);
    expect(screen.getByText("No deadline mentioned")).toBeInTheDocument();
  });
});

describe("opportunity card menu", () => {
  it("offers Hide all from this sender and shows the fee badge", async () => {
    const opp = { ...seed.opportunities[0], fee: { amount: 500, currency: "INR", text: "Pay ₹500." } };
    const onHideSender = vi.fn();
    render(
      <OpportunityCard
        opp={opp}
        now={NOW}
        onToggleSave={vi.fn()}
        actions={{ onToggleSave: vi.fn(), onApply: vi.fn(), onRemind: vi.fn(), onDismiss: vi.fn(), onHideSender }}
      />,
    );
    expect(screen.getByText("Asks for a fee: ₹500")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: `More actions for ${opp.title}` }));
    const menu = await screen.findByRole("menu");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Hide all from this sender" }));
    expect(onHideSender).toHaveBeenCalledWith(opp);
  });
});
