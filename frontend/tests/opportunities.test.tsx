import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { matchChecklist } from "@/components/oppora/match-checklist";
import { OpportunityCard } from "@/components/oppora/opportunity-card";
import { InfoItem } from "@/components/oppora/info-item";
import { MatchRing } from "@/components/oppora/badges";
import {
  filterByType,
  parseSort,
  parseTypeFilter,
  searchOpportunities,
  sortOpportunities,
  typeCounts,
  chipTypes,
} from "@/lib/domain/opportunities";
import { createSeed } from "@/lib/mock/seed";
import { MapPin } from "lucide-react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOW = new Date(2026, 9, 2, 9, 30);
const opps = createSeed(NOW).opportunities;
const byId = (id: string) => opps.find((o) => o.id === id)!;

describe("search + filters", () => {
  it("searches title, organization and skills, case-insensitively", () => {
    expect(searchOpportunities(opps, "GOOGLE").map((o) => o.id).sort()).toEqual(
      ["opp_google_summer_2027", "opp_wtm_scholarship"].sort(),
    );
    expect(searchOpportunities(opps, "react").length).toBe(3);
    expect(searchOpportunities(opps, "react bengaluru").map((o) => o.id)).toEqual(["opp_swiggy_ui_engineer"]);
    expect(searchOpportunities(opps, "   ")).toHaveLength(12);
    expect(searchOpportunities(opps, "zzz")).toHaveLength(0);
  });

  it("counts chips from the data", () => {
    expect(typeCounts(opps)).toEqual({ All: 12, Internship: 4, Hackathon: 3, Job: 3, Scholarship: 2, Competition: 0, Fellowship: 0, Event: 0 });
    // Only types the user has get a chip; a selected empty type stays so it can be cleared.
    expect(chipTypes(opps, "All")).toEqual(["All", "Internship", "Hackathon", "Job", "Scholarship"]);
    expect(chipTypes(opps, "Event")).toEqual(["All", "Internship", "Hackathon", "Job", "Scholarship", "Event"]);
    expect(filterByType(opps, "Hackathon")).toHaveLength(3);
  });

  it("parses URL params safely", () => {
    expect(parseTypeFilter("Job")).toBe("Job");
    expect(parseTypeFilter("<script>")).toBe("All");
    expect(parseSort("deadline")).toBe("deadline");
    expect(parseSort(null)).toBe("relevance");
  });
});

describe("sorting", () => {
  it("relevance = highest match first", () => {
    expect(sortOpportunities(opps, "relevance", NOW).slice(0, 3).map((o) => o.matchScore)).toEqual([92, 90, 88]);
  });
  it("deadline = soonest open first, closed last", () => {
    const ids = sortOpportunities(opps, "deadline", NOW).map((o) => o.id);
    expect(ids.slice(0, 2)).toEqual(["opp_tcs_codevita_2026", "opp_microsoft_explore"]);
    expect(ids.slice(-2)).toEqual(["opp_razorpay_fe_intern", "opp_bright_futures_merit"]);
  });
  it("priority = High, then Medium, then Low; ties by deadline", () => {
    const sorted = sortOpportunities(opps, "priority", NOW);
    expect(sorted.slice(0, 3).map((o) => o.id)).toEqual([
      "opp_tcs_codevita_2026",
      "opp_microsoft_explore",
      "opp_google_summer_2027",
    ]);
    expect(sorted.at(-1)!.priority).toBe("Low");
  });
});

describe("AI Summary checklist", () => {
  it("shows met items for a strong match", () => {
    const items = matchChecklist(byId("opp_amazon_frontend"), NOW);
    expect(items.map((i) => i.label)).toEqual([
      "Matches your skills",
      "Matches your interests",
      "Eligibility not mentioned in email",
      "Deadline is still available",
    ]);
    expect(items.map((i) => i.ok)).toEqual([true, true, false, true]);
  });
  it("keeps unmet items as warnings instead of hiding them", () => {
    const items = matchChecklist(byId("opp_razorpay_fe_intern"), NOW);
    expect(items).toHaveLength(4);
    expect(items[3]).toEqual({ ok: false, label: "Deadline has passed" });
  });
});

describe("OpportunityCard", () => {
  it("shows the brief's fields and toggles save", async () => {
    const onToggleSave = vi.fn();
    const amazon = byId("opp_amazon_frontend");
    render(<OpportunityCard opp={amazon} now={NOW} onToggleSave={onToggleSave} />);
    expect(screen.getByRole("link", { name: "Frontend Developer" })).toHaveAttribute("href", "/opportunities/opp_amazon_frontend");
    expect(screen.getByText("Amazon · Job")).toBeInTheDocument();
    expect(screen.getByText("7 days left")).toHaveClass("text-soon");
    expect(screen.getByText("86% Match")).toBeInTheDocument();
    expect(screen.getByText("Medium Priority")).toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Saved. Remove Frontend Developer from saved" });
    expect(save.querySelector("svg")).toHaveClass("fill-violet");
    await userEvent.click(save);
    expect(onToggleSave).toHaveBeenCalledWith(amazon);
  });
});

describe("SaveToggle", () => {
  it("says and shows when it is not saved", () => {
    const zoho = byId("opp_zoho_web_dev");
    render(<OpportunityCard opp={zoho} now={NOW} onToggleSave={vi.fn()} />);
    const btn = screen.getByRole("button", { name: "Not saved. Save Junior Web Developer" });
    expect(btn.querySelector("svg")).toHaveClass("fill-none");
  });
});

describe("missing data", () => {
  it("InfoItem shows 'Not mentioned in email' for null", () => {
    render(
      <dl>
        <InfoItem icon={MapPin} label="Location">
          {null}
        </InfoItem>
      </dl>,
    );
    expect(screen.getByText("Not mentioned in email")).toBeInTheDocument();
  });
  it("MatchRing exposes its value", () => {
    render(<MatchRing value={92} />);
    expect(screen.getByRole("meter", { name: "92% match with your profile" })).toHaveAttribute("aria-valuenow", "92");
  });
});
