import type { NextConfig } from "next";

/** Django API origin (server-side only; never shipped to the browser). */
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:8000";
const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy (Next.js "without nonces" variant: nonces would force
 * every page to render dynamically). Everything loads from this origin: fonts
 * are self-hosted by next/font, there are no third-party scripts or images,
 * and the API is proxied under /api. Dev only: React needs 'unsafe-eval' and
 * the HMR websocket.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HTTPS only in production (on localhost it would break plain-http development).
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // No Next.js dev badge: it overlapped app UI in previews.
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
