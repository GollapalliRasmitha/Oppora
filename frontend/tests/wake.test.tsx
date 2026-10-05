import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }), Toaster: () => null }));

import { WakeLink } from "@/components/oppora/wake-link";
import { WakingNotice } from "@/components/oppora/waking-notice";
import { request } from "@/lib/api/client";
import { WAKE_FAILED_MESSAGE, WAKING_MESSAGE, waitForBackend, wakeStatus } from "@/lib/wake";

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * A fake backend: `health` says, call by call, whether GET /api/health answers
 * (true) or not (false); `api` lists the responses for everything else (a
 * Response, or "timeout" for a request that hangs until it's aborted).
 */
function backend({ health, api }: { health: boolean[]; api: (Response | "timeout")[] }) {
  const calls: { url: string; method: string }[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET" });
    if (url === "/api/health") return health.length && health.shift() ? json(200, { ok: true }) : new Response("", { status: 502 });
    const next = api.shift();
    if (next === undefined) throw new Error(`unexpected request ${url}`);
    if (next === "timeout") throw new DOMException("The operation timed out.", "TimeoutError");
    return next;
  });
  vi.stubGlobal("fetch", fetch);
  return { calls, apiCalls: () => calls.filter((c) => c.url !== "/api/health"), healthCalls: () => calls.filter((c) => c.url === "/api/health") };
}

/** Runs `p` to completion with fake timers (the wake-up polling waits seconds between checks). */
async function settle<T>(p: Promise<T>): Promise<T> {
  const out = p.then(
    (v) => ({ v }),
    (e) => ({ e }),
  );
  await vi.runAllTimersAsync();
  const r = (await out) as { v?: T; e?: unknown };
  if ("e" in r) throw r.e;
  return r.v as T;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.cookie = "csrftoken=t";
});
afterEach(async () => {
  await vi.runAllTimersAsync(); // let a "failed" notice clear itself
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("waking a sleeping free-tier server", () => {
  it("a read that hits a sleeping server waits until it answers, then retries", async () => {
    const b = backend({ health: [false, false, true], api: [new Response("", { status: 502 }), json(200, { ok: 1 })] });
    const seen: string[] = [];
    const p = request<{ ok: number }>("/insights/dashboard");
    // While it waits, the notice says so.
    await vi.advanceTimersByTimeAsync(100);
    seen.push(wakeStatus());
    await expect(settle(p)).resolves.toEqual({ ok: 1 });
    expect(seen).toEqual(["waking"]);
    expect(wakeStatus()).toBe("idle");
    expect(b.apiCalls()).toHaveLength(2);
    expect(b.healthCalls()).toHaveLength(3);
  });

  it("503 and 504 count as waking too", async () => {
    for (const status of [503, 504]) {
      backend({ health: [false, true], api: [new Response("", { status }), json(200, [])] });
      await expect(settle(request("/opportunities"))).resolves.toEqual([]);
    }
  });

  it("a request that times out is treated like a sleeping server", async () => {
    const b = backend({ health: [false, true], api: ["timeout", json(200, { name: "Alex" })] });
    await expect(settle(request("/auth/me"))).resolves.toEqual({ name: "Alex" });
    expect(b.apiCalls()).toHaveLength(2);
  });

  it("a change sent to a sleeping server is sent again once it's awake (it can't have run)", async () => {
    const b = backend({ health: [false, true], api: [new Response("", { status: 502 }), json(201, { saved: true })] });
    await expect(settle(request("/saved", { method: "POST", body: { opportunityId: "o1" } }))).resolves.toEqual({ saved: true });
    expect(b.apiCalls().map((c) => c.method)).toEqual(["POST", "POST"]);
  });

  it("a change is never repeated when the server was already awake (it may have run)", async () => {
    const b = backend({ health: [true], api: [new Response("", { status: 502 })] });
    await expect(settle(request("/applications", { method: "POST", body: {} }))).rejects.toMatchObject({ code: "server" });
    expect(b.apiCalls()).toHaveLength(1);
  });

  it("gives up after 3 retries", async () => {
    const b = backend({ health: [true, true, true], api: Array.from({ length: 4 }, () => new Response("", { status: 502 })) });
    await expect(settle(request("/opportunities"))).rejects.toMatchObject({ code: "server" });
    expect(b.apiCalls()).toHaveLength(4); // the first try + 3 retries
  });

  it("if the server doesn't wake up within about 90 seconds, it says so", async () => {
    backend({ health: [], api: [new Response("", { status: 502 })] });
    await expect(settle(request("/opportunities"))).rejects.toMatchObject({ code: "server", message: WAKE_FAILED_MESSAGE });
  });

  it("a page's parallel requests share one wait", async () => {
    const b = backend({
      health: [false, true],
      api: [new Response("", { status: 502 }), new Response("", { status: 502 }), json(200, 1), json(200, 2)],
    });
    const both = Promise.all([request("/a"), request("/b")]);
    await settle(both);
    expect(b.healthCalls()).toHaveLength(2); // one shared poll, not one per request
  });

  it("an awake server is not polled at all", async () => {
    const b = backend({ health: [], api: [json(200, { ok: true })] });
    await settle(request("/opportunities"));
    expect(b.healthCalls()).toHaveLength(0);
  });
});

describe("the waking notice", () => {
  it("shows the friendly message while waking, and nothing otherwise", async () => {
    backend({ health: [false, true], api: [] });
    render(<WakingNotice />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    const p = waitForBackend();
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByRole("status")).toHaveTextContent(WAKING_MESSAGE);
    await act(() => settle(p));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

describe("sign-in waits for the server first", () => {
  let assign: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
  });

  it("goes to Google only once the backend answers", async () => {
    const b = backend({ health: [false, false, true], api: [] });
    render(<WakeLink href="/api/auth/google/login?next=/dashboard">Sign in with Google</WakeLink>);
    const link = screen.getByRole("link", { name: "Sign in with Google" });
    fireEvent.click(link);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(assign).not.toHaveBeenCalled(); // still waking
    expect(link).toHaveAttribute("aria-busy", "true");
    await act(() => vi.runAllTimersAsync());
    expect(assign).toHaveBeenCalledWith("/api/auth/google/login?next=/dashboard");
    expect(b.healthCalls()).toHaveLength(3);
  });

  it("an awake backend means no delay", async () => {
    backend({ health: [true], api: [] });
    render(<WakeLink href="/api/auth/demo">Try the demo</WakeLink>);
    fireEvent.click(screen.getByRole("link", { name: "Try the demo" }));
    await act(() => vi.runAllTimersAsync());
    expect(assign).toHaveBeenCalledWith("/api/auth/demo");
  });

  it("stays on the page and can be tried again if the server never wakes", async () => {
    backend({ health: [], api: [] });
    render(<WakeLink href="/api/auth/demo">Try the demo</WakeLink>);
    const link = screen.getByRole("link", { name: "Try the demo" });
    fireEvent.click(link);
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(assign).not.toHaveBeenCalled();
    expect(link).not.toHaveAttribute("aria-busy");
  });

  it("Ctrl/⌘-click still opens a new tab as usual", () => {
    const b = backend({ health: [], api: [] });
    render(<WakeLink href="/api/auth/demo">Try the demo</WakeLink>);
    const link = screen.getByRole("link", { name: "Try the demo" });
    const notPrevented = fireEvent.click(link, { ctrlKey: true });
    expect(notPrevented).toBe(true); // the browser handles it
    expect(b.calls).toHaveLength(0);
  });
});
