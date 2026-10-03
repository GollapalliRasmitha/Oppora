import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CalendarEvent } from "@/components/oppora/calendar-event";
import { BarChart, DonutChart } from "@/components/oppora/charts";
import {
  buildCalendarItems,
  itemsByDay,
  parseDateParam,
  parseView,
  shiftDate,
  timeLabel,
  weekOf,
} from "@/lib/domain/calendar";
import { computeInsights } from "@/lib/domain/insights";
import { createSeed } from "@/lib/mock/seed";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOW = new Date(2026, 9, 2, 9, 30); // Friday
const seed = createSeed(NOW);

describe("insights", () => {
  const ins = computeInsights(seed.opportunities, seed.emails, NOW);

  it("computes the highlight cards from the data", () => {
    expect(ins.mostCommonCategory).toEqual({ type: "Internship", count: 4, percent: 33, tied: false });
    expect(ins.topCompany).toEqual({ name: "Google", count: 2, tied: false });
    expect(ins.bestDay?.count).toBeGreaterThan(0);
  });

  it("counts opportunity emails found per day over the range, ending today", () => {
    expect(ins.trend).toHaveLength(7);
    expect(ins.trend.at(-1)!.date).toBe("2026-10-02");
    // Oldest → today: bars on 6 of 7 days (nothing has arrived yet today).
    expect(ins.trend.map((p) => p.count)).toEqual([1, 1, 1, 2, 2, 3, 0]);
    expect(ins.trendTotal).toBe(10);
    const month = computeInsights(seed.opportunities, seed.emails, NOW, 30);
    expect(month.trend).toHaveLength(30);
    expect(month.trendTotal).toBe(19);
    // Non-opportunity emails (newsletter, college, promotion) are not counted.
    expect(month.trendTotal).toBeLessThan(seed.emails.filter((e) => new Date(e.receivedAt) > new Date(2026, 8, 3)).length);
  });

  it("splits progress into disjoint groups (applied ÷ all tracked)", () => {
    expect(ins.progress).toEqual({ applied: 8, inProgress: 3, saved: 1, other: 0, total: 12, appliedPercent: 67 });
  });

  it("writes the recommendation from the data", () => {
    expect(ins.recommendation).toBe("Based on your profile, you have 3 opportunities worth reviewing this week.");
    expect(computeInsights([], [], NOW).recommendation).toMatch(/Nothing new/);
  });

  it("reports ties instead of hiding them", () => {
    const tied = seed.opportunities.filter((o) => o.type === "Hackathon" || o.type === "Job");
    expect(computeInsights(tied, [], NOW).mostCommonCategory?.tied).toBe(true);
  });
});

describe("calendar items", () => {
  const items = buildCalendarItems(seed.opportunities, seed.interviews, NOW);
  const byDay = itemsByDay(items);

  it("includes every event type", () => {
    expect(new Set(items.map((i) => i.kind))).toEqual(new Set(["application", "hackathon", "scholarship", "interview", "reminder"]));
  });

  it("places reminders 09:00 the day before the deadline", () => {
    const r = items.find((i) => i.id === "reminder_opp_tcs_codevita_2026")!;
    expect(r.date).toBe("2026-10-03");
    expect(new Date(r.start!).getHours()).toBe(9);
  });

  it("schedules interviews from the seed and sorts all-day first", () => {
    const day = byDay.get("2026-10-07")!;
    expect(day.map((i) => i.kind)).toEqual(["interview"]);
    expect(timeLabel(day[0])).toBe("14:00–14:45");
    const sunday = byDay.get("2026-10-04")!;
    expect(sunday[0].start).toBeNull(); // TCS deadline (all day) before the MS reminder
  });

  it("drops reminders for closed deadlines and items for dismissed opportunities", () => {
    const opps = seed.opportunities.map((o) => (o.id === "opp_atlassian_swe_intern" ? { ...o, dismissed: true } : o));
    const list = buildCalendarItems(opps, seed.interviews, NOW);
    expect(list.some((i) => i.opportunityId === "opp_atlassian_swe_intern")).toBe(false);
  });
});

describe("calendar navigation", () => {
  it("builds Monday-first weeks", () => {
    expect(weekOf("2026-10-02")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });
  it("steps by view", () => {
    expect(shiftDate("2026-10-02", "day", 1)).toBe("2026-10-03");
    expect(shiftDate("2026-10-02", "week", -1)).toBe("2026-09-25");
    expect(shiftDate("2026-10-31", "month", 1)).toBe("2026-11-01");
  });
  it("parses URL params safely", () => {
    expect(parseView("week")).toBe("week");
    expect(parseView("year")).toBe("month");
    expect(parseDateParam("2026-13-99", "2026-10-02")).toBe("2026-10-02");
    expect(parseDateParam("nonsense", "2026-10-02")).toBe("2026-10-02");
    expect(parseDateParam("2026-02-30", "2026-10-02")).toBe("2026-10-02");
    expect(parseDateParam("2026-11-05", "2026-10-02")).toBe("2026-11-05");
  });
});

describe("CalendarEvent", () => {
  it("links to the opportunity and names the type and time", () => {
    const iv = buildCalendarItems(seed.opportunities, seed.interviews, NOW).find((i) => i.kind === "interview")!;
    render(<CalendarEvent item={iv} now={NOW} colorBy="kind" />);
    const link = screen.getByRole("link", { name: "Technical interview — Atlassian, Interview, 14:00–14:45" });
    expect(link).toHaveAttribute("href", "/opportunities/opp_atlassian_swe_intern");
  });
});

describe("charts", () => {
  const data = [
    { key: "a", label: "Mon", fullLabel: "Monday 28 September", value: 0 },
    { key: "b", label: "Tue", fullLabel: "Tuesday 29 September", value: 3 },
  ];

  it("BarChart exposes values to assistive tech and offers a table", async () => {
    render(<BarChart data={data} title="Found per day" unit={["opportunity", "opportunities"]} />);
    expect(screen.getByRole("img", { name: /Found per day: Monday 28 September 0, Tuesday 29 September 3/ })).toBeInTheDocument();
    const bar = screen.getByLabelText("Tuesday 29 September: 3 opportunities");
    await userEvent.hover(bar);
    expect(screen.getByRole("tooltip")).toHaveTextContent("3 opportunities");
    await userEvent.click(screen.getByRole("button", { name: "Show table" }));
    expect(screen.getByRole("table")).toHaveTextContent("Tuesday 29 September3");
  });

  it("DonutChart legend carries labels, values and percentages", () => {
    render(
      <DonutChart
        title="Progress"
        centerValue="67%"
        centerLabel="Applied"
        data={[
          { key: "a", label: "Applied", value: 8 },
          { key: "b", label: "In Progress", value: 3 },
          { key: "c", label: "Saved", value: 1 },
          { key: "d", label: "Other", value: 0 },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "Progress: Applied 8, In Progress 3, Saved 1, Other 0" })).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument(); // In Progress share in the legend
    expect(screen.getByText("Applied", { selector: "span.text-meta" }).previousSibling).toHaveTextContent("67%"); // centre
  });
});
