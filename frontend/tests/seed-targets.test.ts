import { describe, expect, it } from "vitest";
import {
  buildRecommendation,
  computeDashboardStats,
  latestOpportunities,
  upcomingDeadlines,
} from "@/lib/domain/stats";
import { seedEmails, seedOpportunities } from "@/lib/mock/seed";

// The brief's dashboard targets must come out of the data on the demo date.
const NOW = new Date(2026, 9, 2, 9, 30);

describe("seed targets on 2 Oct 2026", () => {
  const stats = computeDashboardStats(seedOpportunities, NOW);

  it("Total opportunities 12 (+2 this week)", () => {
    expect(stats.total.value).toBe(12);
    expect(stats.total.trend).toBe(2);
  });
  it("Deadlines this week 4 (2 urgent)", () => {
    expect(stats.deadlinesThisWeek.value).toBe(4);
    expect(stats.deadlinesThisWeek.urgent).toBe(2);
  });
  it("Applied 8 (+1)", () => {
    expect(stats.applied.value).toBe(8);
    expect(stats.applied.trend).toBe(1);
  });
  it("In progress 3 (+1)", () => {
    expect(stats.inProgress.value).toBe(3);
    expect(stats.inProgress.trend).toBe(1);
  });
  it("Saved 7", () => {
    expect(stats.saved).toBe(7);
  });

  it("lists the five brief opportunities as the latest", () => {
    expect(latestOpportunities(seedOpportunities).map((o) => o.title).sort()).toEqual(
      [
        "Frontend Developer",
        "Google Summer Internship 2027",
        "Microsoft Explore",
        "TCS CodeVita 2026",
        "Women Techmakers Scholarship",
      ].sort(),
    );
  });

  it("orders upcoming deadlines soonest first", () => {
    expect(upcomingDeadlines(seedOpportunities, NOW).map((o) => o.id)).toEqual([
      "opp_tcs_codevita_2026",
      "opp_microsoft_explore",
      "opp_wtm_scholarship",
      "opp_amazon_frontend",
    ]);
  });

  it("generates the AI recommendation from the data", () => {
    expect(buildRecommendation(seedOpportunities, NOW).message).toBe(
      "I found 3 opportunities that strongly match your interests. Two have deadlines coming up soon.",
    );
  });

  it("links every opportunity to an existing source email", () => {
    const ids = new Set(seedEmails.map((e) => e.id));
    for (const o of seedOpportunities) for (const id of o.sourceEmailIds) expect(ids.has(id)).toBe(true);
  });

  it("includes non-opportunity emails and a read/unread mix", () => {
    const cats = new Set<string>(seedEmails.map((e) => e.category));
    expect(["Newsletter", "College", "Promotion"].every((c) => cats.has(c))).toBe(true);
    expect(seedEmails.some((e) => e.read)).toBe(true);
    expect(seedEmails.some((e) => !e.read)).toBe(true);
  });
});

describe("stats react to user actions", () => {
  it("ignores dismissed opportunities", () => {
    const opps = seedOpportunities.map((o) => (o.id === "opp_amazon_frontend" ? { ...o, dismissed: true } : o));
    const s = computeDashboardStats(opps, NOW);
    expect(s.total.value).toBe(11);
    expect(s.deadlinesThisWeek.value).toBe(3);
  });
  it("handles an empty account", () => {
    const s = computeDashboardStats([], NOW);
    expect(s.total.value).toBe(0);
    expect(buildRecommendation([], NOW).message).toMatch(/new strong matches/);
  });
});
