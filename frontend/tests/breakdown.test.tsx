import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ScoreBreakdownView } from "@/components/oppora/score-breakdown";
import type { ScoreBreakdown } from "@/lib/domain/types";

const bd: ScoreBreakdown = {
  relevance: 75,
  profileWeight: 0.5,
  profile: 100,
  parts: [
    { key: "interests", label: "Interests", status: "met", points: 40, max: 40 },
    { key: "skills", label: "Skills", status: "unknown", points: null, max: 30 },
    { key: "experience", label: "Level", status: "unknown", points: null, max: 15 },
    { key: "deadline", label: "Deadline", status: "open", points: 15, max: 15 },
  ],
  locationBonus: 0,
  feePenalty: 25,
  score: 63,
};

describe("score breakdown", () => {
  it("explains every part and adds up to the score", async () => {
    render(<ScoreBreakdownView breakdown={bd} />);
    await userEvent.click(screen.getByRole("button", { name: "How this match % is worked out" }));
    expect(screen.getByText("Not mentioned · neutral")).toBeInTheDocument(); // skills: neutral, not 0
    expect(screen.getByText("40 / 40")).toBeInTheDocument();
    expect(screen.getByText("Asks for a fee")).toBeInTheDocument();
    expect(screen.getByText("−25")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument(); // profile 100 × 50%
    expect(screen.getByText("38")).toBeInTheDocument(); // relevance line absorbs rounding: 50 + 38 − 25 = 63
    expect(screen.getByText("63%")).toBeInTheDocument();
  });
});
