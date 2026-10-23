import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

// What the website forwards to Django: the request headers Next.js passes on ("x-middleware-request-*").
function forwarded(init: Record<string, string>) {
  const response = proxy(new NextRequest("https://oppora-app.vercel.app/api/auth/demo", { headers: init }));
  const get = (name: string) => response.headers.get(`x-middleware-request-${name}`);
  return { ip: get("x-oppora-client-ip"), secret: get("x-oppora-proxy-secret") };
}

afterEach(() => vi.unstubAllEnvs());

describe("proxy: the visitor's IP for Django (backend/core/client_ip.py)", () => {
  it("passes Vercel's visitor IP with the secret", () => {
    vi.stubEnv("PROXY_SECRET", "s3cret-value");
    expect(forwarded({ "x-real-ip": "198.51.100.23" })).toEqual({ ip: "198.51.100.23", secret: "s3cret-value" });
  });

  it("never passes on a value the browser sent itself", () => {
    vi.stubEnv("PROXY_SECRET", "s3cret-value");
    const sent = forwarded({
      "x-forwarded-for": "198.51.100.23",
      "x-oppora-client-ip": "203.0.113.66",
      "x-oppora-proxy-secret": "guessed",
    });
    expect(sent).toEqual({ ip: "198.51.100.23", secret: "s3cret-value" });
  });

  it("adds nothing without a secret (local development)", () => {
    vi.stubEnv("PROXY_SECRET", "");
    expect(forwarded({ "x-real-ip": "198.51.100.23" })).toEqual({ ip: null, secret: null });
  });
});
