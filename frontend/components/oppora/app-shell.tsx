"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { getPreferences } from "@/lib/api";
import { applyTheme, storedTheme } from "@/lib/theme";
import { FloatingAIButton } from "./floating-ai-button";
import { Header } from "./header";
import { LazyAIAssistantPanel } from "./lazy-panels";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { ShellProvider } from "./shell-context";
import { Sidebar } from "./sidebar";

/** Mirrors the account's theme into this browser (e.g. after choosing it on another device). */
function useThemeSync() {
  useEffect(() => {
    let live = true;
    getPreferences()
      .then((p) => {
        if (live && p.theme && p.theme !== storedTheme()) applyTheme(p.theme);
      })
      .catch(() => {}); // keep the stored theme; the page shows its own load errors
    return () => {
      live = false;
    };
  }, []);
}

/** Layout shared by every signed-in page. */
export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  useThemeSync();
  return (
    <ShellProvider>
      <div className="ambient min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:text-sm focus:font-semibold"
        >
          Skip to content
        </a>
        <Sidebar expanded={sidebarExpanded} onExpandedChange={setSidebarExpanded} />
        <div className="md:pl-[var(--sidebar-w-collapsed)] lg:pl-[var(--sidebar-w)]">
          <Header />
          <main id="main" tabIndex={-1} className="mx-auto max-w-[1280px] px-4 pb-[var(--fab-clearance)] pt-6 outline-none sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
        <MobileBottomNav />
        <FloatingAIButton />
        <LazyAIAssistantPanel />
      </div>
    </ShellProvider>
  );
}
