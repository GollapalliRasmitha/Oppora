import { daysLeft, daysLeftLabel } from "./dates";
import type { MatchCheck, MatchReasons, Opportunity, User } from "./types";

/**
 * Explains a match from the user's profile and the extracted fields.
 * Mirrors what the Stage 8 pipeline will store; a check is "unknown"
 * whenever the email or the profile doesn't give enough information.
 */

const INTEREST_SIGNALS: Record<string, (o: MatchInput) => boolean> = {
  "frontend development": (o) =>
    /front-?end|\bUI\b|web/i.test(o.title) ||
    o.skills.some((s) => /react|css|html|typescript|web development/i.test(s)),
  "software engineering": (o) =>
    (o.type === "Internship" || o.type === "Job") &&
    (/software|engineer|developer|internship|explore/i.test(o.title) ||
      o.skills.some((s) => /software engineering|programming|data structures|algorithms/i.test(s))),
  hackathons: (o) => o.type === "Hackathon",
};

type MatchInput = Pick<Opportunity, "title" | "type" | "skills" | "eligibility">;

const norm = (s: string) => s.trim().toLowerCase();

export function explainMatch(o: MatchInput, user: Pick<User, "interests" | "skills" | "experienceLevel">): MatchReasons {
  const mine = new Set(user.skills.map(norm));
  const matchedSkills = o.skills.filter((s) => mine.has(norm(s)));
  const skills: MatchCheck = o.skills.length === 0 || user.skills.length === 0 ? "unknown" : matchedSkills.length > 0 ? "met" : "unmet";

  const matchedInterests = user.interests.filter((i) => INTEREST_SIGNALS[norm(i)]?.(o));
  const interests: MatchCheck = matchedInterests.length > 0 ? "met" : "unmet";

  let experience: MatchCheck = "unknown";
  if (o.eligibility && user.experienceLevel && /student/i.test(user.experienceLevel)) {
    // Only claim a fit when the email explicitly targets students.
    if (/\bstudents?\b|undergraduate/i.test(o.eligibility)) experience = "met";
  }

  return { skills, interests, experience, matchedSkills, matchedInterests };
}

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** One-sentence explanation shown in the AI Summary. */
export function matchSentence(r: MatchReasons): string {
  if (r.matchedInterests.length > 0) {
    return `This opportunity matches your profile because of your interest in ${list(r.matchedInterests)}.`;
  }
  if (r.matchedSkills.length > 0) {
    return `This opportunity matches your profile because it uses skills you have: ${list(r.matchedSkills)}.`;
  }
  return "This opportunity is only a partial match for your profile.";
}

export type ChecklistItem = { ok: boolean; label: string; detail?: string };

const joinList = (xs: string[]) => xs.join(", ");

/** Builds the four AI Summary checks. Unmet or unknown checks become warnings. */
export function matchChecklist(opp: Opportunity, now: Date): ChecklistItem[] {
  const r = opp.matchReasons;
  const items: ChecklistItem[] = [];

  const skills: Record<MatchCheck, ChecklistItem> = {
    met: { ok: true, label: "Matches your skills", detail: joinList(r.matchedSkills) },
    unmet: { ok: false, label: "Doesn't list skills from your profile", detail: joinList(opp.skills) },
    unknown: { ok: false, label: "Skills not mentioned in email" },
  };
  items.push(skills[r.skills]);

  items.push(
    r.interests === "met"
      ? { ok: true, label: "Matches your interests", detail: joinList(r.matchedInterests) }
      : { ok: false, label: "Outside your listed interests" },
  );

  const experience: Record<MatchCheck, ChecklistItem> = {
    met: { ok: true, label: "Suitable experience level", detail: opp.eligibility ?? undefined },
    unmet: { ok: false, label: "May not fit your experience level", detail: opp.eligibility ?? undefined },
    unknown: {
      ok: false,
      label: opp.eligibility ? "Check the eligibility for your level" : "Eligibility not mentioned in email",
      detail: opp.eligibility ?? undefined,
    },
  };
  items.push(experience[r.experience]);

  const d = daysLeft(opp.deadline, now);
  items.push(
    d === null
      ? { ok: false, label: "Deadline not mentioned in email" }
      : d < 0
        ? { ok: false, label: "Deadline has passed" }
        : { ok: true, label: "Deadline is still available", detail: daysLeftLabel(d) },
  );
  return items;
}

