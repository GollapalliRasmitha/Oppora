import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let search = "?next=/opportunities";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const api = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updatePreferences: vi.fn(),
  startSync: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

import { WelcomeView } from "@/app/(onboarding)/welcome/welcome-view";

const settings = (mode: string, gmail = "connected") => ({
  user: { name: "Asha" },
  preferences: { ai: { mode } },
  gmail: { status: gmail },
});

beforeEach(() => {
  vi.clearAllMocks();
  search = "?next=/opportunities";
  api.updatePreferences.mockResolvedValue({});
  api.startSync.mockResolvedValue({ phase: "scanning" });
});

describe("AI consent screen", () => {
  it("explains what goes to Gemini before anything is scanned", async () => {
    api.getSettings.mockResolvedValue(settings("ask"));
    render(<WelcomeView />);
    expect(await screen.findByRole("heading", { name: "Before Oppora reads your Gmail" })).toBeInTheDocument();
    expect(screen.getByText(/Google's Gemini free tier/)).toBeInTheDocument();
    expect(screen.getByText(/where Google may review it/)).toBeInTheDocument();
    for (const x of ["email addresses", "phone numbers", "your name"]) expect(screen.getByText(new RegExp(x))).toBeInTheDocument();
    expect(api.startSync).not.toHaveBeenCalled();
  });

  it("Continue saves the AI choice, then starts the first scan", async () => {
    api.getSettings.mockResolvedValue(settings("ask"));
    render(<WelcomeView />);
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/opportunities"));
    expect(api.updatePreferences).toHaveBeenCalledWith({ ai: { mode: "ai" } });
    expect(api.updatePreferences.mock.invocationCallOrder[0]).toBeLessThan(api.startSync.mock.invocationCallOrder[0]);
  });

  it("Use without AI saves the rules-only choice", async () => {
    api.getSettings.mockResolvedValue(settings("ask", "disconnected"));
    render(<WelcomeView />);
    await userEvent.click(await screen.findByRole("button", { name: "Use without AI" }));
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(api.updatePreferences).toHaveBeenCalledWith({ ai: { mode: "rules" } });
    expect(api.startSync).not.toHaveBeenCalled(); // no Gmail connected: nothing to scan
  });

  it("nothing is scanned when the choice can't be saved", async () => {
    api.getSettings.mockResolvedValue(settings("ask"));
    api.updatePreferences.mockRejectedValue(new Error("offline"));
    render(<WelcomeView />);
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await waitFor(() => expect(api.updatePreferences).toHaveBeenCalled());
    expect(api.startSync).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("someone who already chose goes straight on, and next stays on this site", async () => {
    search = "?next=//evil.example";
    api.getSettings.mockResolvedValue(settings("rules"));
    render(<WelcomeView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });
});
