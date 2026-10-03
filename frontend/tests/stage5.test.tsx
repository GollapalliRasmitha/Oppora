import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AIAssistantPanel, FloatingAIButton } from "@/components/oppora/ai-assistant";
import { ShellProvider } from "@/components/oppora/shell-context";
import { MultiChips } from "@/components/ui/filter-chips";
import { SwitchRow } from "@/components/ui/switch";
import { TagInput } from "@/components/ui/tag-input";
import { SUGGESTED_PROMPTS, type AssistantAnswer } from "@/lib/domain/assistant";
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

// The panel talks to the API through lib/api; the answers themselves are
// built and tested on the server (backend/tests/test_domain.py).
const answer: AssistantAnswer = {
  text: "3 high-priority opportunities are still open:",
  links: [{ href: "/opportunities/opp_tcs_codevita_2026", title: "TCS CodeVita 2026", subtitle: "TCS · Hackathon · 2 days left · 88% match" }],
  followUps: [],
};
const askAssistant = vi.fn(async () => answer);
vi.mock("@/lib/api", () => ({
  askAssistant: (...args: unknown[]) => askAssistant(...(args as [])),
  listOpportunities: async () => seed.opportunities,
  getCurrentUser: async () => seed.user,
}));

describe("assistant prompts", () => {
  it("are exactly the brief's prompts", () => {
    expect([...SUGGESTED_PROMPTS]).toEqual([
      "Find internships for me",
      "What deadlines are approaching?",
      "Show high-priority opportunities",
      "Why is this opportunity relevant?",
      "What should I apply for this week?",
    ]);
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
    expect(askAssistant).toHaveBeenCalledWith("Show high-priority opportunities", { opportunityId: null });
    const link = await within(dialog).findByRole("link", { name: /TCS CodeVita 2026/ }, { timeout: 3000 });
    expect(link).toHaveAttribute("href", "/opportunities/opp_tcs_codevita_2026");
    // Prompts stay available after the first answer.
    expect(within(dialog).getByRole("group", { name: "Suggested questions" })).toBeInTheDocument();
  });
});
