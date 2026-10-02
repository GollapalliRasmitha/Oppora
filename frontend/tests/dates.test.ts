import { describe, expect, it } from "vitest";
import { daysLeft, daysLeftLabel, formatDate, greetingFor, urgencyFor } from "@/lib/domain/dates";

const NOW = new Date(2026, 9, 2, 9, 30); // 2 Oct 2026, 09:30 local

describe("daysLeft", () => {
  it("counts whole calendar days from today", () => {
    expect(daysLeft("2026-10-04", NOW)).toBe(2);
    expect(daysLeft("2026-10-05", NOW)).toBe(3);
    expect(daysLeft("2026-12-15", NOW)).toBe(74);
    expect(daysLeft("2026-10-02", NOW)).toBe(0);
    expect(daysLeft("2026-09-25", NOW)).toBe(-7);
  });
  it("returns null when no deadline was found", () => {
    expect(daysLeft(null, NOW)).toBeNull();
  });
});

describe("urgencyFor", () => {
  it("uses red ≤3, orange 4–10, blue >10", () => {
    expect(urgencyFor(0)).toBe("urgent");
    expect(urgencyFor(3)).toBe("urgent");
    expect(urgencyFor(4)).toBe("soon");
    expect(urgencyFor(10)).toBe("soon");
    expect(urgencyFor(11)).toBe("later");
    expect(urgencyFor(-1)).toBe("passed");
    expect(urgencyFor(null)).toBe("none");
  });
});

describe("labels", () => {
  it("always spells out the days", () => {
    expect(daysLeftLabel(1)).toBe("1 day left");
    expect(daysLeftLabel(7)).toBe("7 days left");
    expect(daysLeftLabel(0)).toBe("Due today");
    expect(daysLeftLabel(-2)).toBe("Closed");
  });
  it("shows missing dates honestly", () => {
    expect(formatDate(null)).toBe("Not mentioned in email");
    expect(formatDate("2026-12-15")).toBe("15 Dec 2026");
  });
  it("greets by time of day", () => {
    expect(greetingFor(new Date(2026, 9, 2, 8))).toBe("Good Morning");
    expect(greetingFor(new Date(2026, 9, 2, 14))).toBe("Good Afternoon");
    expect(greetingFor(new Date(2026, 9, 2, 20))).toBe("Good Evening");
  });
});
