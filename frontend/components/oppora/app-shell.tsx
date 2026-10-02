"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AIAssistantPanel, FloatingAIButton } from "./ai-assistant";
import { Header } from "./header";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { ShellProvider } from "./shell-context";
import { Sidebar } from "./sidebar";

/** Layout shared by every signed-in page. */
export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
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
          <main id="main" tabIndex={-1} className="mx-auto max-w-[1280px] px-4 pb-28 pt-6 outline-none sm:px-6 md:pb-12 lg:px-8">
            {children}
          </main>
        </div>
        <MobileBottomNav />
        <FloatingAIButton />
        <AIAssistantPanel />
      </div>
    </ShellProvider>
  );
}
