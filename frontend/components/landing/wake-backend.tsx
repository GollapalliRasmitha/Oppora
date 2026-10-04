"use client";

import { useEffect } from "react";
import { wakeBackend } from "@/lib/api/client";

/** The free-tier API sleeps when idle: start waking it while the visitor reads the landing page. */
export function WakeBackend() {
  useEffect(() => wakeBackend(), []);
  return null;
}
