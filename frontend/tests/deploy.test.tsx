import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() });
  return fn;
});
vi.mock("sonner", () => ({ toast: sonner, Toaster: () => null }));

let shellUser: { readOnly?: boolean } | undefined;
vi.mock("@/components/oppora/shell-context", () => ({ useShell: () => ({ user: shellUser }) }));

import { DemoBanner } from "@/components/oppora/demo-banner";
import { toast } from "@/components/ui/toast";
import { ApiError, request } from "@/lib/api/client";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = "csrftoken=t";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("read-only demo", () => {
  it("one clear message replaces the action's generic error toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(403, { error: { code: "demo_read_only", message: "This is a read-only demo, so changes aren't saved." } })),
    );
    const err = (await request("/saved", { method: "POST", body: {} }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("read_only_demo");
    expect(sonner.info).toHaveBeenCalledWith("This is a read-only demo", expect.objectContaining({ id: "read-only-demo" }));
    toast.error("Couldn't save the email. Please try again."); // what the action's catch block shows
    expect(sonner.error).not.toHaveBeenCalled();
  });

  it("other errors still show (after the demo message's short quiet window)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 3000);
    toast.error("Couldn't save your profile. Please try again.");
    expect(sonner.error).toHaveBeenCalled();
  });

  it("the banner shows only in the read-only demo", () => {
    shellUser = { readOnly: true };
    const { rerender } = render(<DemoBanner />);
    expect(screen.getByText(/read-only demo/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Use your own Gmail" })).toHaveAttribute("href", "/api/auth/google/login?next=/dashboard");
    shellUser = { readOnly: false };
    rerender(<DemoBanner />);
    expect(screen.queryByText(/read-only demo/)).toBeNull();
  });
});
