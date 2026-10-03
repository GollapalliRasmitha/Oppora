import type { NextConfig } from "next";

/** Django API origin (server-side only; never shipped to the browser). */
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // No Next.js dev badge: it overlapped app UI in previews.
  devIndicators: false,
  /**
   * The browser only talks to this origin; /api/* is proxied to Django, so the
   * session and CSRF cookies are first-party and no CORS is needed. Services
   * call paths without a trailing slash and Django's URLs end with one.
   */
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_ORIGIN}/api/:path*/` }];
  },
};

export default nextConfig;
