import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only "N" badge: keep it clear of the AI assistant's input (bottom of the screen).
  devIndicators: { position: "top-right" },
};

export default nextConfig;
