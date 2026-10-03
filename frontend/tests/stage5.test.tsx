import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIAssistantPanel, FloatingAIButton } from "@/components/oppora/ai-assistant";
import { ShellProvider } from "@/components/oppora/shell-context";
import { MultiChips } from "@/components/ui/filter-chips";
import { SwitchRow } from "@/components/ui/switch";
import { TagInput } from "@/components/ui/tag-input";
import { answerQuestion, SUGGESTED_PROMPTS } from "@/lib/domain/assistant";
import { createSeed } from "@/lib/mock/seed";

vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: { href: string; children: ReactNode; onClick?: () => void }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

const NOW = new Date(2026, 9, 2, 9, 30);
const seed = createSeed(NOW);
const ask = (q: string, ctx = {}) => answerQuestion(q, seed, NOW, ctx);
const titles = (q: string, ctx = {}) => ask(q, ctx).links.map((l) => l.title);

describe("assistant: the five suggested prompts", () => {
  it("are exactly the brief's prompts", () => {
    expect([...SUGGESTED_PROMPTS]).toEqual([
      "Find internships for me",
      "What deadlines are approaching?",
      "Show high-priority opportunities",
      "Why is this opportunity relevant?",
      "What should I apply for this week?",
    ]);
  });

  it("Find internships → open internships, best match first, each linked", () => {
    const a = ask("Find internships for me");
    expect(a.text).toBe("You have 3 open internships, best match first:");
    expect(a.links.map((l) => l.href)).toEqual([
      "/opportunities/opp_google_summer_2027",
      "/opportunities/opp_microsoft_explore",
      "/opportunities/opp_atlassian_swe_intern",
    ]);
  });

  it("What deadlines are approaching → next 7 days, soonest first", () => {
    const a = ask("What deadlines are approaching?");
    expect(a.text).toBe("4 deadlines are coming up in the next 7 days (2 within 3 days):");
    expect(a.links.map((l) => l.title)).toEqual(["TCS CodeVita 2026", "Microsoft Explore", "Women Techmakers Scholarship", "Frontend Developer"]);
  });

  it("Show high-priority → only open High priority", () => {
    expect(titles("Show high-priority opportunities")).toEqual(["TCS CodeVita 2026", "Microsoft Explore", "Google Summer Internship 2027"]);
  });

  it("Why is this relevant → uses the open opportunity, else asks which", () => {
    const withCtx = ask("Why is this opportunity relevant?", { opportunityId: "opp_amazon_frontend" });
    expect(withCtx.text).toContain("Frontend Developer — 86% match.");
    expect(withCtx.text).toContain("✓ Matches your skills (React, TypeScript, CSS)");
    expect(withCtx.text).toContain("⚠ Eligibility not mentioned in email");
    expect(withCtx.links[0].href).toBe("/opportunities/opp_amazon_frontend");

    const noCtx = ask("Why is this opportunity relevant?");
    expect(noCtx.links).toEqual([]);
    expect(noCtx.followUps).toContain("Why is TCS CodeVita 2026 relevant?");
  });

  it("What should I apply for this week → unapplied, closing soonest, then strong matches", () => {
    expect(titles("What should I apply for this week?")).toEqual([
      "TCS CodeVita 2026",
      "Microsoft Explore",
      "Frontend Developer",
      "Google Summer Internship 2027",
    ]);
  });
});

describe("assistant grounding", () => {
  it("summarises a named opportunity from its stored fields only", () => {
    const a = ask("tell me about amazon");
    expect(a.text).toContain("Frontend Developer — Amazon · Job.");
    expect(a.text).toContain("Status: not started.");
    expect(a.links).toHaveLength(1);
  });

  it("lists interviews and says when the email doesn't give an end time or place", () => {
    const a = ask("any interviews coming up?");
    expect(a.links.map((l) => l.subtitle)).toEqual([
      "7 Oct 2026 · 14:00–14:45 · Video call",
      "11 Oct 2026 · 11:00 · location not mentioned in email",
    ]);
  });

  it("finds emails by sender", () => {
    expect(ask("show emails from zoho").links.map((l) => l.title)).toEqual(["Your application is under review", "Junior Web Developer — Chennai"]);
  });

  it("says so when the data doesn't contain the answer", () => {
    const a = ask("what's the weather in Paris?");
    expect(a.text).toMatch(/^I couldn't find that in your opportunities or emails/);
    expect(a.links).toEqual([]);
    expect(a.followUps.length).toBeGreaterThan(0);
  });

  it("never answers from nothing", () => {
    const a = answerQuestion("Find internships for me", { opportunities: [], emails: [], interviews: [] }, NOW);
    expect(a.text).toMatch(/hasn't found any opportunities/);
  });

  it("every link points at a real opportunity or the inbox", () => {
    const ids = new Set(seed.opportunities.map((o) => `/opportunities/${o.id}`));
    for (const q of [...SUGGESTED_PROMPTS, "show saved", "what have I applied to", "hackathons", "emails from google careers"]) {
      for (const l of ask(q).links) expect(ids.has(l.href) || l.href.startsWith("/inbox?q=")).toBe(true);
    }
  });
});

describe("settings services", () => {
  beforeEach(() => vi.resetModules());

  it("notification preferences filter the bell", async () => {
    const api = await import("@/lib/api");
    const before = (await api.listNotifications()).map((n) => n.kind);
    expect(before).toContain("deadline");
    await api.updatePreferences({ notifications: { deadlineReminders: false } });
    await api.updatePreferences({ ai: { recommendations: false } });
    const after = (await api.listNotifications()).map((n) => n.kind);
    expect(after).toEqual(["new_opportunity"]);
    expect((await api.getDashboard()).recommendation).toBeNull();
    expect((await api.getInsights()).recommendation).toBeNull();
  });

  it("profile changes re-explain matches", async () => {
    const api = await import("@/lib/api");
    const amazonBefore = await api.getOpportunity("opp_amazon_frontend");
    expect(amazonBefore.matchReasons.skills).toBe("met");
    await api.updateProfile({ skills: ["Python"] });
    const amazonAfter = await api.getOpportunity("opp_amazon_frontend");
    expect(amazonAfter.matchReasons.skills).toBe("unmet");
  });

  it("disconnecting Gmail blocks scans with the Gmail error", async () => {
    const api = await import("@/lib/api");
    await api.disconnectGmail();
    await expect(api.startSync()).rejects.toMatchObject({ code: "gmail" });
    await api.connectGmail();
    await expect(api.startSync()).resolves.toMatchObject({ phase: "scanning" });
  });

  it("delete my data removes everything and disconnects Gmail", async () => {
    const api = await import("@/lib/api");
    await api.deleteMyData();
    expect(await api.listOpportunities()).toEqual([]);
    expect(await api.listEmails()).toEqual([]);
    expect((await api.getSettings()).gmail.status).toBe("disconnected");
  });
});

describe("settings controls", () => {
  it("SwitchRow is a labelled switch", async () => {
    const onChange = vi.fn();
    render(<SwitchRow label="Deadline reminders" description="Alerts before deadlines" checked={false} onCheckedChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "Deadline reminders" });
    expect(sw).toHaveAccessibleDescription("Alerts before deadlines");
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("TagInput adds with Enter and removes with ×", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<TagInput label="Skills" value={["React"]} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Skills"), "CSS{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["React", "CSS"]);
    rerender(<TagInput label="Skills" value={["React", "CSS"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove React" }));
    expect(onChange).toHaveBeenLastCalledWith(["CSS"]);
  });

  it("MultiChips toggles several values", async () => {
    const onChange = vi.fn();
    render(
      <MultiChips
        label="Categories"
        value={["Job"]}
        onValueChange={onChange}
        options={[
          { value: "Job", label: "Job" },
          { value: "Hackathon", label: "Hackathon" },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Hackathon" }));
    expect(onChange).toHaveBeenCalledWith(["Job", "Hackathon"]);
  });
});

describe("AI assistant panel", () => {
  it("shows the five prompts and answers a clicked prompt with linked sources", async () => {
    render(
      <ShellProvider>
        <FloatingAIButton />
        <AIAssistantPanel />
      </ShellProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open Oppora AI assistant" }));
    const dialog = await screen.findByRole("dialog", { name: "Oppora AI" });
    for (const p of SUGGESTED_PROMPTS) expect(within(dialog).getByRole("button", { name: p })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Show high-priority opportunities" }));
    const link = await within(dialog).findByRole("link", { name: /TCS CodeVita 2026/ }, { timeout: 3000 });
    expect(link).toHaveAttribute("href", "/opportunities/opp_tcs_codevita_2026");
    // Prompts stay available after the first answer.
    expect(within(dialog).getByRole("group", { name: "Suggested questions" })).toBeInTheDocument();
  });
});
