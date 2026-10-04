import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DeadlineItem } from "@/components/oppora/deadline-item";
import { EmailCard } from "@/components/oppora/email-card";
import { MonthCalendar } from "@/components/oppora/month-calendar";
import { Swipeable } from "@/components/ui/swipeable";
import { deadlineItems, itemsByDay } from "@/lib/domain/calendar";
import { deadlineKind, groupDeadlines, monthGrid } from "@/lib/domain/deadlines";
import { buildInbox, isDeadlineEmail, parseInboxFilter } from "@/lib/domain/inbox";
import { createSeed } from "@/lib/mock/seed";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOW = new Date(2026, 9, 2, 9, 30);
const { opportunities: opps, emails } = createSeed(NOW);
const byId = (id: string) => opps.find((o) => o.id === id)!;

describe("deadlines domain", () => {
  it("groups this week / later / closed from today", () => {
    const g = groupDeadlines(opps, NOW);
    expect(g.thisWeek.map((o) => o.id)).toEqual([
      "opp_tcs_codevita_2026",
      "opp_microsoft_explore",
      "opp_wtm_scholarship",
      "opp_amazon_frontend",
    ]);
    expect(g.later).toHaveLength(6);
    expect(g.closed.map((o) => o.id)).toEqual(["opp_razorpay_fe_intern", "opp_bright_futures_merit"]);
  });

  it("indexes events by date and skips dismissed ones", () => {
    const map = itemsByDay(deadlineItems(opps.map((o) => (o.id === "opp_amazon_frontend" ? { ...o, dismissed: true } : o))));
    expect(map.get("2026-10-04")?.map((o) => o.opportunityId)).toEqual(["opp_tcs_codevita_2026"]);
    expect(map.has("2026-10-09")).toBe(false);
  });

  it("builds a Monday-first 6-week grid", () => {
    const grid = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(1);
    expect(grid[0].getDate()).toBe(28); // Mon 28 Sep
    expect(grid[3].getDate()).toBe(1);
  });

  it("knows the kind of each deadline", () => {
    expect(deadlineKind(byId("opp_tcs_codevita_2026"))).toBe("hackathon");
    expect(deadlineKind(byId("opp_wtm_scholarship"))).toBe("scholarship");
    expect(deadlineKind(byId("opp_amazon_frontend"))).toBe("application");
  });
});

describe("inbox domain", () => {
  it("counts filters from the data", () => {
    const v = buildInbox(emails, opps, "", "All", NOW);
    expect(v.counts).toEqual({ All: 27, Opportunities: 24, Deadlines: 8, Other: 3 });
    expect(v.unread).toBe(5);
    expect(v.items[0].id).toBe("em_amazon_jobs"); // newest first
  });

  it("filters by search and hides archived emails", () => {
    const archived = emails.map((e) => (e.id === "em_promo" ? { ...e, archived: true } : e));
    const v = buildInbox(archived, opps, "codevita", "All", NOW);
    expect(v.items.map((e) => e.id)).toEqual(["em_tcs_reminder", "em_tcs_codevita"]);
    expect(buildInbox(archived, opps, "", "Other", NOW).items.map((e) => e.id)).not.toContain("em_promo");
  });

  it("treats emails about deadlines in the next 7 days as Deadlines", () => {
    const map = new Map(opps.map((o) => [o.id, o]));
    expect(isDeadlineEmail(emails.find((e) => e.id === "em_tcs_reminder")!, map, NOW)).toBe(true);
    expect(isDeadlineEmail(emails.find((e) => e.id === "em_google_careers")!, map, NOW)).toBe(false);
    expect(parseInboxFilter("nope")).toBe("All");
  });
});

describe("MonthCalendar", () => {
  const events = itemsByDay(deadlineItems(opps));

  it("labels days with their deadlines and supports keyboard selection", async () => {
    const onSelect = vi.fn();
    render(
      <MonthCalendar month={{ year: 2026, month: 9 }} onMonthChange={vi.fn()} events={events} selected={null} onSelect={onSelect} now={NOW} />,
    );
    const today = screen.getByRole("button", { name: /^Friday, 2 October 2026$/ });
    expect(today).toHaveAttribute("aria-current", "date");
    expect(today).toHaveAttribute("tabindex", "0");

    today.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    const sunday = screen.getByRole("button", { name: "Sunday, 4 October 2026, 1 item: TCS CodeVita 2026" });
    expect(sunday).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("2026-10-04");
  });

  it("changes month with PageDown", async () => {
    const onMonthChange = vi.fn();
    render(
      <MonthCalendar month={{ year: 2026, month: 9 }} onMonthChange={onMonthChange} events={events} selected={null} onSelect={vi.fn()} now={NOW} />,
    );
    screen.getByRole("button", { name: /^Friday, 2 October 2026$/ }).focus();
    await userEvent.keyboard("{PageDown}");
    expect(onMonthChange).toHaveBeenCalledWith({ year: 2026, month: 10 });
  });
});

describe("DeadlineItem", () => {
  it("offers the three actions and shows completion", async () => {
    const onRemind = vi.fn();
    const onComplete = vi.fn();
    const { rerender } = render(
      <ul>
        <DeadlineItem opp={byId("opp_amazon_frontend")} now={NOW} onRemind={onRemind} onComplete={onComplete} />
      </ul>,
    );
    expect(screen.getByText("7 days left")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set Reminder for Frontend Developer" }));
    expect(screen.getByRole("button", { name: "Set Reminder for Frontend Developer" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Mark Frontend Developer complete" }));
    expect(onRemind).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open Frontend Developer" })).toHaveAttribute("href", "/opportunities/opp_amazon_frontend");

    rerender(
      <ul>
        <DeadlineItem opp={byId("opp_wtm_scholarship")} now={NOW} onRemind={onRemind} onComplete={onComplete} />
      </ul>,
    );
    expect(screen.getByRole("button", { name: "Women Techmakers Scholarship is complete" })).toBeDisabled();
  });
});

describe("EmailCard", () => {
  it("shows unread state and opens via the subject", async () => {
    const onOpen = vi.fn();
    const e = emails.find((x) => x.id === "em_amazon_jobs")!;
    render(<EmailCard email={e} onOpen={onOpen} footer={<button>Extract Opportunity</button>} />);
    expect(screen.getByRole("article", { name: /^Unread\. New role for you/ })).toBeInTheDocument();
    expect(screen.getByText("86% relevant")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: e.subject }));
    expect(onOpen).toHaveBeenCalled();
  });
});

describe("Swipeable", () => {
  const swipe = (el: HTMLElement, pointerType: string, toX: number) => {
    fireEvent.pointerDown(el, { pointerId: 1, pointerType, clientX: 200, clientY: 10 });
    fireEvent.pointerMove(el, { pointerId: 1, pointerType, clientX: (200 + toX) / 2, clientY: 10 });
    fireEvent.pointerMove(el, { pointerId: 1, pointerType, clientX: toX, clientY: 10 });
    fireEvent.pointerUp(el, { pointerId: 1, pointerType, clientX: toX, clientY: 10 });
  };

  it("triggers left/right actions on touch and ignores the mouse", () => {
    const right = vi.fn();
    const left = vi.fn();
    render(
      <Swipeable
        right={{ label: "Save", icon: null, className: "", onTrigger: right }}
        left={{ label: "Archive", icon: null, className: "", onTrigger: left }}
      >
        <p>row</p>
      </Swipeable>,
    );
    const el = screen.getByText("row").parentElement!;
    // jsdom lacks pointer capture
    el.setPointerCapture = () => {};
    swipe(el, "touch", 60);
    expect(left).toHaveBeenCalledOnce();
    swipe(el, "touch", 340);
    expect(right).toHaveBeenCalledOnce();
    swipe(el, "mouse", 60);
    expect(left).toHaveBeenCalledOnce();
  });
});
