import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DigestView } from "@/app/(app)/digest/digest-view";
import { NotificationItem } from "@/components/oppora/notification-item";
import type { Digest } from "@/lib/domain/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const item = { id: "o1", title: "Frontend Intern", organization: "Acme", type: "Internship" as const, deadline: "2026-10-06", daysLeft: 2, matchScore: 82, fee: null };
const digest: Digest = {
  weekOf: "2026-09-28",
  weekLabel: "Week of 28 Sept",
  newThisWeek: [item],
  topMatches: [{ ...item, why: "This opportunity matches your profile because of your interest in frontend development.", matchReasons: { skills: "met", interests: "met", experience: "unknown", matchedSkills: ["React"], matchedInterests: ["frontend development"] } }],
  deadlinesSoon: [item],
  feeWarnings: [{ ...item, id: "o2", title: "Python Internship", organization: "Infotact", fee: { amount: 500, currency: "INR", text: "Pay a registration fee of Rs. 500/-." } }],
  progress: { applied: 8, inProgress: 3, saved: 1, total: 12, appliedPercent: 67 },
};
vi.mock("@/lib/api", () => ({ getDigest: async () => digest }));

describe("weekly digest page", () => {
  it("shows every section from the data", async () => {
    render(<DigestView />);
    const top = await screen.findByRole("region", { name: "Top matches" });
    expect(within(top).getByText(/because of your interest in frontend development/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Deadlines in the next 7 days" })).getByText("2 days left")).toBeInTheDocument();
    const fees = screen.getByRole("region", { name: "Asks for a fee" });
    expect(within(fees).getByText("From the email: “Pay a registration fee of Rs. 500/-.”")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Application progress" })).getByText("67% of 12")).toBeInTheDocument();
    expect(screen.getByText(/Week of 28 Sept/)).toBeInTheDocument();
  });
});

describe("digest notification", () => {
  it("opens the digest page", () => {
    render(
      <ul>
        <NotificationItem
          item={{ id: "n1", kind: "ai_recommendation", title: "Your weekly digest", body: "2 new opportunities.", createdAt: "2026-10-05T02:45:00Z", read: false, opportunityId: null, href: "/digest" }}
          onMarkRead={() => {}}
        />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "Your weekly digest" })).toHaveAttribute("href", "/digest");
  });
});
