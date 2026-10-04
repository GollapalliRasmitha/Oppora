import { daysLeft, daysLeftLabel } from "./dates";
import skillAliases from "./skill-aliases.json";
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

type MatchInput = Pick<Opportunity, "title" | "type" | "skills" | "eligibility"> &
  Partial<Pick<Opportunity, "summary" | "requirements">>;

const norm = (s: string) => s.trim().toLowerCase();

// Same table and rules as backend/core/domain/match.py (a backend test keeps the JSON files identical,
// and the parity test compares both implementations on the whole seed).
const ALIASES: Record<string, string[]> = Object.fromEntries(
  Object.entries(skillAliases as Record<string, string | string[]>).filter(([k]) => !k.startsWith("_")),
) as Record<string, string[]>;
const CANONICAL: Record<string, string> = Object.fromEntries(
  Object.entries(ALIASES).flatMap(([canon, aliases]) => aliases.map((a) => [a, canon])),
);

/** "ReactJS" / "React.js" / "react" → "react"; unknown skills stay as written (lowercased). */
export function canonicalSkill(skill: string): string {
  const s = norm(skill).replace(/\s+/g, " ");
  return CANONICAL[s] ?? CANONICAL[s.replace(/ /g, "")] ?? s;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive: "java" doesn't match "javascript"; "c++" and "node.js" work. */
function mentions(text: string, phrase: string): boolean {
  return new RegExp(`(?<![a-z0-9])${escapeRe(phrase)}(?![a-z0-9+#])`).test(text);
}

function skillText(o: MatchInput): string {
  return [o.title ?? "", o.summary ?? "", ...(o.requirements ?? []), ...o.skills].join(" \n ").toLowerCase();
}

export function matchedSkillsFor(o: MatchInput, userSkills: string[]): string[] {
  const listed = new Set(o.skills.map(canonicalSkill));
  const text = skillText(o);
  return userSkills.filter((skill) => {
    const canon = canonicalSkill(skill);
    return listed.has(canon) || (ALIASES[canon] ?? [canon]).some((a) => mentions(text, a));
  });
}

const singular = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const STOP = new Set(["and", "or", "the", "of", "in", "for", "to", "a", "an", "with", "on"]);

function interestMatches(interest: string, o: MatchInput): boolean {
  const key = norm(interest);
  if (INTEREST_SIGNALS[key]?.(o)) return true;
  const words = (key.match(/[a-z0-9+#.]+/g) ?? []).filter((w) => !STOP.has(w)).map(singular);
  if (words.length === 0) return false;
  if (words.length === 1 && words[0] === o.type.toLowerCase()) return true; // "internships" → Internship
  const text = skillText(o);
  return words.every((w) => mentions(text, w) || mentions(text, `${w}s`));
}

export function explainMatch(o: MatchInput, user: Pick<User, "interests" | "skills" | "experienceLevel">): MatchReasons {
  const matchedSkills = matchedSkillsFor(o, user.skills);
  const skills: MatchCheck =
    user.skills.length === 0 ? "unknown" : matchedSkills.length > 0 ? "met" : o.skills.length > 0 ? "unmet" : "unknown";

  const matchedInterests = user.interests.filter((i) => interestMatches(i, o));
  const interests: MatchCheck = user.interests.length === 0 ? "unknown" : matchedInterests.length > 0 ? "met" : "unmet";

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
    // The email listed skills but the profile has none, or the email names no skills at all.
    unknown: { ok: false, label: opp.skills.length ? "Add skills to your profile to compare" : "Skills not mentioned in email" },
  };
  items.push(skills[r.skills]);

  const interests: Record<MatchCheck, ChecklistItem> = {
    met: { ok: true, label: "Matches your interests", detail: joinList(r.matchedInterests) },
    unmet: { ok: false, label: "Outside your listed interests" },
    unknown: { ok: false, label: "Add interests to your profile to compare" },
  };
  items.push(interests[r.interests]);

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

