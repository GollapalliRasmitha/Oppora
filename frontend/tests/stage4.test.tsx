import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CalendarEvent } from "@/components/oppora/calendar-event";
import { BarChart, DonutChart } from "@/components/oppora/charts";
import { itemsByDay, parseDateParam, parseView, shiftDate, timeLabel, weekOf } from "@/lib/domain/calendar";
import type { CalendarItem } from "@/lib/domain/types";
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

// Calendar items are built by the server (backend tests); these are the UI helpers.
describe("calendar day lists", () => {
  const base = { location: null, end: null, opportunityId: "o", organization: "Org", date: "2026-10-04" };
  it("sorts all-day items first, then by start time", () => {
    const items: CalendarItem[] = [
      { ...base, id: "r", kind: "reminder", title: "Reminder", start: new Date(2026, 9, 4, 9).toISOString() },
      { ...base, id: "d", kind: "hackathon", title: "TCS CodeVita 2026", start: null },
    ];
    expect(itemsByDay(items).get("2026-10-04")!.map((i) => i.id)).toEqual(["d", "r"]);
  });
  it("labels times, with an end only when the email gave one", () => {
    const start = new Date(2026, 9, 7, 14).toISOString();
    expect(timeLabel({ ...base, id: "i", kind: "interview", title: "x", start, end: new Date(2026, 9, 7, 14, 45).toISOString() })).toBe("14:00–14:45");
    expect(timeLabel({ ...base, id: "i", kind: "interview", title: "x", start })).toBe("14:00");
    expect(timeLabel({ ...base, id: "d", kind: "application", title: "x", start: null })).toBe("All day");
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
    const iv = seed.interviews.find((i) => i.id === "iv_atlassian")!;
    const item: CalendarItem = {
      id: iv.id,
      kind: "interview",
      title: iv.title,
      date: "2026-10-07",
      start: iv.start,
      end: iv.end,
      location: iv.location,
      opportunityId: iv.opportunityId,
      organization: "Atlassian",
    };
    render(<CalendarEvent item={item} now={NOW} colorBy="kind" />);
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
