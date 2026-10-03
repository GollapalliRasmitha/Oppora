import { daysLeft, daysLeftLabel, formatDate } from "./dates";
import { matchChecklist, matchSentence } from "./match";
import { SOON_WINDOW_DAYS, strongMatches } from "./stats";
import type { Email, Interview, Opportunity, OpportunityType } from "./types";

/**
 * Oppora AI (mock). Every answer is built only from the user's own stored
 * opportunities, emails and interviews, links to what it mentions, and says
 * so plainly when the data doesn't contain the answer. Stage 8 replaces the
 * intent matching with the LLM, keeping the same grounding contract.
 */

export const SUGGESTED_PROMPTS = [
  "Find internships for me",
  "What deadlines are approaching?",
  "Show high-priority opportunities",
  "Why is this opportunity relevant?",
  "What should I apply for this week?",
] as const;

export interface AssistantLink {
  href: string;
  title: string;
  subtitle: string;
}

export interface AssistantAnswer {
  text: string;
  /** Opportunities or emails the answer is based on. */
  links: AssistantLink[];
  /** Optional follow-up prompts (e.g. to pick an opportunity). */
  followUps: string[];
}

export interface AssistantData {
  opportunities: Opportunity[];
  emails: Email[];
  interviews: Interview[];
}

export interface AssistantContext {
  /** Set when the assistant is opened from an opportunity's page. */
  opportunityId?: string | null;
}

const STATUS: Record<string, string> = { applied: "Applied", in_progress: "In progress" };

function oppLink(o: Opportunity, now: Date): AssistantLink {
  const parts = [`${o.organization} · ${o.type}`, daysLeftLabel(daysLeft(o.deadline, now)), `${o.matchScore}% match`];
  if (o.application) parts.push(STATUS[o.application.status]);
  return { href: `/opportunities/${o.id}`, title: o.title, subtitle: parts.join(" · ") };
}

const isOpen = (o: Opportunity, now: Date) => {
  const d = daysLeft(o.deadline, now);
  return d === null || d >= 0;
};

const byMatch = (a: Opportunity, b: Opportunity) => b.matchScore - a.matchScore;
const byDeadline = (now: Date) => (a: Opportunity, b: Opportunity) =>
  (daysLeft(a.deadline, now) ?? Infinity) - (daysLeft(b.deadline, now) ?? Infinity);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const TYPE_WORDS: [RegExp, OpportunityType][] = [
  [/\bintern(ship)?s?\b/, "Internship"],
  [/\bhackathons?\b/, "Hackathon"],
  [/\bjobs?\b|\broles?\b/, "Job"],
  [/\bscholarships?\b/, "Scholarship"],
  [/\bcompetitions?\b|\bcontests?\b/, "Competition"],
  [/\bfellowships?\b/, "Fellowship"],
  [/\bevents?\b|\bworkshops?\b/, "Event"],
];

const TYPE_PLURAL: Record<OpportunityType, string> = {
  Internship: "internships",
  Job: "jobs",
  Hackathon: "hackathons",
  Scholarship: "scholarships",
  Competition: "competitions",
  Fellowship: "fellowships",
  Event: "events",
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Opportunities the question names by title or organization. */
function mentioned(q: string, opps: Opportunity[]): Opportunity[] {
  const byTitle = opps.filter((o) => q.includes(o.title.toLowerCase()));
  if (byTitle.length) return byTitle;
  const titleWords = opps.filter((o) => {
    const key = o.title.toLowerCase().split(/\s+/).slice(0, 2).join(" ");
    return key.length > 5 && q.includes(key);
  });
  if (titleWords.length) return titleWords;
  return opps.filter((o) => new RegExp(`\\b${escape(o.organization.toLowerCase())}\\b`).test(q));
}

function explain(o: Opportunity, now: Date): AssistantAnswer {
  const checks = matchChecklist(o, now)
    .map((c) => `${c.ok ? "✓" : "⚠"} ${c.label}${c.detail ? ` (${c.detail})` : ""}`)
    .join("\n");
  return {
    text: `${o.title} — ${o.matchScore}% match. ${matchSentence(o.matchReasons)}\n\n${checks}`,
    links: [oppLink(o, now)],
    followUps: [],
  };
}

function summarize(o: Opportunity, now: Date): string {
  const d = daysLeft(o.deadline, now);
  const deadline = o.deadline ? `${formatDate(o.deadline)} (${daysLeftLabel(d)})` : "not mentioned in email";
  const status = o.application ? STATUS[o.application.status] : "not started";
  return [
    `${o.title} — ${o.organization} · ${o.type}.`,
    `Deadline: ${deadline}. Status: ${status}. Priority: ${o.priority}. Match: ${o.matchScore}%.`,
    o.summary ? `From the email: ${o.summary}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function list(title: string, items: Opportunity[], now: Date, empty: string): AssistantAnswer {
  return items.length
    ? { text: title, links: items.map((o) => oppLink(o, now)), followUps: [] }
    : { text: empty, links: [], followUps: [] };
}

export function answerQuestion(question: string, data: AssistantData, now: Date, ctx: AssistantContext = {}): AssistantAnswer {
  const q = question.trim().toLowerCase();
  const opps = data.opportunities.filter((o) => !o.dismissed);
  const open = opps.filter((o) => isOpen(o, now));

  if (opps.length === 0) {
    return {
      text: "Oppora hasn't found any opportunities in your Gmail yet, so I have nothing to answer from. Run a Gmail scan and ask me again.",
      links: [],
      followUps: [],
    };
  }

  const named = mentioned(q, opps);

  // "Why is … relevant?"
  if (/\bwhy\b/.test(q) && /relevant|match|recommend|good fit|fit/.test(q)) {
    const target =
      named.length === 1 ? named[0] : !named.length && ctx.opportunityId ? opps.find((o) => o.id === ctx.opportunityId) : undefined;
    if (target) return explain(target, now);
    const choices = (named.length ? named : strongMatches(opps, now)).slice(0, 3);
    return {
      text: named.length
        ? "More than one opportunity matches that. Which one do you mean?"
        : "Which opportunity do you mean? Open one and ask again, or pick one of these:",
      links: [],
      followUps: choices.map((o) => `Why is ${o.title} relevant?`),
    };
  }

  // "What should I apply for this week?"
  if (/\bapply\b/.test(q) && /week|should|next|now|today/.test(q)) {
    const soon = open.filter((o) => {
      const d = daysLeft(o.deadline, now);
      return o.application?.status !== "applied" && d !== null && d <= SOON_WINDOW_DAYS;
    });
    const strong = strongMatches(opps, now).filter((o) => !soon.includes(o));
    const picks = [...soon.sort(byDeadline(now)), ...strong.sort(byMatch)];
    return list(
      `${plural(soon.length, "opportunity you haven't applied to closes", "opportunities you haven't applied to close")} in the next ${SOON_WINDOW_DAYS} days${
        strong.length ? `, and ${plural(strong.length, "other strong match is", "other strong matches are")} still open` : ""
      }. Start with the ones closing soonest:`,
      picks,
      now,
      "Nothing needs applying this week: you've applied to everything that closes in the next 7 days, and there are no other open strong matches.",
    );
  }

  // Deadlines
  if (/deadline|due|closing|close soon|expir/.test(q)) {
    const soon = open.filter((o) => (daysLeft(o.deadline, now) ?? Infinity) <= SOON_WINDOW_DAYS).sort(byDeadline(now));
    if (soon.length) {
      const urgent = soon.filter((o) => (daysLeft(o.deadline, now) ?? 99) <= 3).length;
      return list(
        `${plural(soon.length, "deadline is", "deadlines are")} coming up in the next ${SOON_WINDOW_DAYS} days${urgent ? ` (${urgent} within 3 days)` : ""}:`,
        soon,
        now,
        "",
      );
    }
    const next = open.filter((o) => o.deadline).sort(byDeadline(now))[0];
    return next
      ? { text: `No deadlines in the next ${SOON_WINDOW_DAYS} days. The next one is ${next.title} on ${formatDate(next.deadline)}.`, links: [oppLink(next, now)], followUps: [] }
      : { text: "None of your open opportunities has a deadline mentioned in its email.", links: [], followUps: [] };
  }

  // High priority
  if (/high[- ]priority|important|priority/.test(q)) {
    const high = open.filter((o) => o.priority === "High").sort(byDeadline(now));
    return list(
      `${plural(high.length, "high-priority opportunity is", "high-priority opportunities are")} still open:`,
      high,
      now,
      "You don't have any open high-priority opportunities right now.",
    );
  }

  // Interviews
  if (/interview/.test(q)) {
    const upcoming = data.interviews
      .filter((iv) => new Date(iv.end ?? iv.start) >= now)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((iv) => ({ iv, opp: opps.find((o) => o.id === iv.opportunityId) }))
      .filter((x): x is { iv: Interview; opp: Opportunity } => !!x.opp);
    if (!upcoming.length) return { text: "I couldn't find any upcoming interviews in your emails.", links: [], followUps: [] };
    return {
      text: `You have ${plural(upcoming.length, "upcoming interview", "upcoming interviews")}:`,
      links: upcoming.map(({ iv, opp }) => {
        const end = iv.end ? `–${timeFmt.format(new Date(iv.end))}` : "";
        const when = `${formatDate(toLocalISO(iv.start))} · ${timeFmt.format(new Date(iv.start))}${end}`;
        return {
          href: `/opportunities/${opp.id}`,
          title: iv.title,
          subtitle: `${when} · ${iv.location ?? "location not mentioned in email"}`,
        };
      }),
      followUps: [],
    };
  }

  // Emails from someone
  const fromMatch = q.match(/emails? (?:from|by) ([a-z0-9 .&-]+)/);
  if (fromMatch) {
    const who = fromMatch[1].trim();
    const found = data.emails.filter((e) => !e.archived && e.sender.toLowerCase().includes(who));
    return found.length
      ? {
          text: `${plural(found.length, "email", "emails")} from ${found[0].sender}:`,
          links: found.slice(0, 6).map((e) => ({
            href: e.opportunityId ? `/opportunities/${e.opportunityId}` : `/inbox?q=${encodeURIComponent(e.subject)}`,
            title: e.subject,
            subtitle: `${e.sender} · ${new Date(e.receivedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
          })),
          followUps: [],
        }
      : { text: `I couldn't find any emails from "${who}" in your inbox.`, links: [], followUps: [] };
  }

  // Status lists
  if (/\bsaved\b/.test(q)) return list("Your saved opportunities:", opps.filter((o) => o.saved).sort(byDeadline(now)), now, "You haven't saved any opportunities yet.");
  if (/\bapplied\b/.test(q)) return list("You've applied to these:", opps.filter((o) => o.application?.status === "applied"), now, "You haven't marked anything as applied yet.");
  if (/in progress|started/.test(q)) return list("Applications in progress:", opps.filter((o) => o.application?.status === "in_progress"), now, "You don't have any applications in progress.");

  // A specific opportunity
  if (named.length === 1) return { text: summarize(named[0], now), links: [oppLink(named[0], now)], followUps: [`Why is ${named[0].title} relevant?`] };
  if (named.length > 1) return list("I found these matching opportunities:", named, now, "");

  // By type ("Find internships for me")
  const type = TYPE_WORDS.find(([re]) => re.test(q))?.[1];
  if (type) {
    const items = open.filter((o) => o.type === type).sort(byMatch);
    return list(
      `You have ${plural(items.length, `open ${TYPE_PLURAL[type].replace(/s$/, "")}`, `open ${TYPE_PLURAL[type]}`)}, best match first:`,
      items,
      now,
      `I couldn't find any open ${TYPE_PLURAL[type]} in your opportunities.`,
    );
  }

  if (/match|recommend|best|suggest/.test(q)) {
    return list("Your strongest matches that are still open:", strongMatches(opps, now).sort(byMatch), now, "You don't have any strong matches open right now.");
  }

  return {
    text: "I couldn't find that in your opportunities or emails. I can only answer from what Oppora found in your Gmail — try one of these:",
    links: [],
    followUps: [...SUGGESTED_PROMPTS.slice(0, 3)],
  };
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Date-only local ISO for a timestamp. */
function toLocalISO(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
