import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthErrorNotice } from "@/components/landing/auth-error-notice";
import { GoogleSignInButton, SIGN_IN_URL } from "@/components/oppora/google-sign-in-button";
import { connectGmail } from "@/lib/api/settings";
import { signOut } from "@/lib/api/user";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let calls: { url: string; init: RequestInit }[];
let responses: Response[];

beforeEach(() => {
  calls = [];
  responses = [];
  document.cookie = "csrftoken=tok";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return responses.shift() ?? json(200, {});
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Google sign-in", () => {
  it("the button is a plain link to Django's OAuth start (full navigation, not client routing)", () => {
    render(<GoogleSignInButton />);
    const link = screen.getByRole("link", { name: "Sign in with Google" });
    expect(link).toHaveAttribute("href", SIGN_IN_URL);
    expect(SIGN_IN_URL).toBe("/api/auth/google/login?next=/dashboard");
  });

  it("explains a failed sign-in and cleans the URL", () => {
    window.history.replaceState(null, "", "/?auth_error=access_denied");
    render(<AuthErrorNotice />);
    expect(screen.getByRole("alert")).toHaveTextContent("only invited Google accounts can connect Gmail");
    expect(window.location.search).toBe("");
  });
});

describe("Gmail connection", () => {
  it("follows the server's redirect to Google for real accounts", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, search: "" });
    responses.push(json(200, { redirect: "/api/auth/google/login?intent=connect" }));
    void connectGmail();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/api/auth/google/login?intent=connect"));
  });

  it("the demo account is connected directly", async () => {
    responses.push(json(200, { status: "connected", email: "x", connectedAt: null, scopes: [], initialSyncDays: 60 }));
    await expect(connectGmail()).resolves.toMatchObject({ status: "connected" });
  });

  it("sign out ends the session on the server", async () => {
    responses.push(new Response(null, { status: 204 }));
    await signOut();
    expect(calls[0].url).toBe("/api/auth/logout");
    expect(calls[0].init.method).toBe("POST");
  });
});
