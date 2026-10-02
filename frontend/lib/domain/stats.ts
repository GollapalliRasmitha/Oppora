import { daysLeft, isWithinLastWeek, urgencyFor } from "./dates";
import type { Email, Notification, Opportunity } from "./types";

/** Match score at or above which an opportunity counts as a strong match. */
export const STRONG_MATCH = 88;
/** "Deadlines this week" / "coming up soon" window, in days from today. */
export const SOON_WINDOW_DAYS = 7;

export interface StatValue {
  value: number;
  /** Change over the last 7 days, shown as the trend line. */
  trend: number;
  trendLabel: string;
}

export interface DashboardStats {
  total: StatValue;
  deadlinesThisWeek: StatValue & { urgent: number };
  applied: StatValue;
  inProgress: StatValue;
  saved: number;
}

const active = (opps: Opportunity[]) => opps.filter((o) => !o.dismissed);

export function computeDashboardStats(opps: Opportunity[], now: Date): DashboardStats {
  const list = active(opps);
  const thisWeek = list.filter((o) => {
    const d = daysLeft(o.deadline, now);
    return d !== null && d >= 0 && d <= SOON_WINDOW_DAYS;
  });
  const urgent = thisWeek.filter((o) => urgencyFor(daysLeft(o.deadline, now)) === "urgent").length;
  const applied = list.filter((o) => o.application?.status === "applied");
  const inProgress = list.filter((o) => o.application?.status === "in_progress");

  const newThisWeek = list.filter((o) => isWithinLastWeek(o.discoveredAt, now)).length;
  const appliedThisWeek = applied.filter((o) => isWithinLastWeek(o.application!.appliedAt, now)).length;
  const startedThisWeek = inProgress.filter((o) => isWithinLastWeek(o.application!.startedAt, now)).length;

  return {
    total: { value: list.length, trend: newThisWeek, trendLabel: `+${newThisWeek} this week` },
    deadlinesThisWeek: {
      value: thisWeek.length,
      urgent,
      trend: urgent,
      trendLabel: `${urgent} urgent`,
    },
    applied: { value: applied.length, trend: appliedThisWeek, trendLabel: `+${appliedThisWeek} this week` },
    inProgress: { value: inProgress.length, trend: startedThisWeek, trendLabel: `+${startedThisWeek} this week` },
    saved: list.filter((o) => o.saved).length,
  };
}

/** Most recently discovered first. */
export function latestOpportunities(opps: Opportunity[], limit = 5): Opportunity[] {
  return [...active(opps)]
    .sort((a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime())
    .slice(0, limit);
}

/** Open deadlines within the next `windowDays` days, soonest first. */
export function upcomingDeadlines(opps: Opportunity[], now: Date, windowDays = SOON_WINDOW_DAYS): Opportunity[] {
  return active(opps)
    .filter((o) => {
      const d = daysLeft(o.deadline, now);
      return d !== null && d >= 0 && d <= windowDays;
    })
    .sort((a, b) => (daysLeft(a.deadline, now) ?? 0) - (daysLeft(b.deadline, now) ?? 0));
}

/** Strong matches the user hasn't applied to yet and that are still open. */
export function strongMatches(opps: Opportunity[], now: Date): Opportunity[] {
  return active(opps).filter((o) => {
    const d = daysLeft(o.deadline, now);
    return o.matchScore >= STRONG_MATCH && o.application?.status !== "applied" && (d === null || d >= 0);
  });
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n: number) => WORDS[n] ?? String(n);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface Recommendation {
  message: string;
  matchIds: string[];
  soonIds: string[];
}

/** AI recommendation copy, generated from the data (never hard-coded). */
export function buildRecommendation(opps: Opportunity[], now: Date): Recommendation {
  const matches = strongMatches(opps, now);
  const soon = matches.filter((o) => {
    const d = daysLeft(o.deadline, now);
    return d !== null && d <= SOON_WINDOW_DAYS;
  });
  const n = matches.length;
  let message: string;
  if (n === 0) {
    message = "I haven't found any new strong matches for your interests yet. I'll keep watching your inbox.";
  } else {
    message = `I found ${n} ${n === 1 ? "opportunity that strongly matches" : "opportunities that strongly match"} your interests.`;
    if (soon.length === 0) message += ` None of ${n === 1 ? "it closes" : "them close"} in the next ${SOON_WINDOW_DAYS} days.`;
    else if (soon.length === n && n === 1) message += " It has a deadline coming up soon.";
    else message += ` ${cap(word(soon.length))} ${soon.length === 1 ? "has a deadline" : "have deadlines"} coming up soon.`;
  }
  return { message, matchIds: matches.map((o) => o.id), soonIds: soon.map((o) => o.id) };
}

/** Number of emails received in the last 7 days — used by the mock sync. */
export function recentEmailCount(emails: Email[], now: Date): number {
  return emails.filter((e) => isWithinLastWeek(e.receivedAt, now)).length;
}

/** Bell notifications derived from the data (Stage 5 moves these to the API). */
export function deriveNotifications(opps: Opportunity[], now: Date): Notification[] {
  const list = active(opps);
  const out: Notification[] = [];
  const newest = [...strongMatches(list, now)].sort((a, b) => b.matchScore - a.matchScore)[0];
  if (newest) {
    out.push({
      id: `n_new_${newest.id}`,
      kind: "new_opportunity",
      title: "New opportunity found",
      body: `${newest.title} matches your profile.`,
      createdAt: newest.discoveredAt,
      read: false,
      opportunityId: newest.id,
    });
  }
  const closest = upcomingDeadlines(list, now).find((o) => o.application?.status !== "applied");
  if (closest) {
    const d = daysLeft(closest.deadline, now)!;
    out.push({
      id: `n_deadline_${closest.id}`,
      kind: "deadline",
      title: "Deadline approaching",
      body: `${closest.title} closes ${d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}.`,
      createdAt: now.toISOString(),
      read: false,
      opportunityId: closest.id,
    });
  }
  const worth = strongMatches(list, now).length;
  if (worth > 0) {
    out.push({
      id: "n_ai_recommendation",
      kind: "ai_recommendation",
      title: "AI recommendation",
      body: `You have ${worth} ${worth === 1 ? "opportunity" : "opportunities"} worth reviewing.`,
      createdAt: now.toISOString(),
      read: true,
      opportunityId: null,
    });
  }
  return out;
}
