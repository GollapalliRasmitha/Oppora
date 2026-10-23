import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Runs before every /api request is forwarded to Django (next.config.ts rewrites).
 *
 * On Render, Django can't count back to the visitor through Vercel + Cloudflare + Render's relay, so here we pass on
 * the visitor's IP, with PROXY_SECRET so Django knows the header came from us and not from someone faking it
 * (backend/core/client_ip.py). The same design as HomeHaat's frontend/proxy.ts.
 *
 * The IP comes from Vercel's x-real-ip / x-forwarded-for, which Vercel sets itself (a browser can't fake them).
 * Locally there's no secret and nothing is added.
 */
export function proxy(request: NextRequest) {
  const secret = process.env.PROXY_SECRET;
  if (!secret) return NextResponse.next();

  const headers = new Headers(request.headers);
  const ip =
    request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  headers.delete("x-oppora-client-ip"); // never pass on a value the browser sent itself
  headers.delete("x-oppora-proxy-secret");
  if (ip) {
    headers.set("x-oppora-client-ip", ip);
    headers.set("x-oppora-proxy-secret", secret);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/api/:path*" };
