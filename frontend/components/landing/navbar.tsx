"use client";

import Link from "next/link";
import { SIGN_IN_URL } from "@/components/oppora/google-sign-in-button";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/oppora/logo";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#about", label: "About" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-bg/60 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/40">
      <nav aria-label="Primary" className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Oppora home" className="rounded-md focus-ring">
          <Logo />
        </Link>
        <ul className="ml-auto hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="inline-flex h-11 items-center rounded-md px-3 text-sm font-semibold text-ink-2 focus-ring transition-colors hover:text-ink">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <Button asChild size="sm" className="ml-auto md:ml-2">
          <a href={SIGN_IN_URL}>Get Started</a>
        </Button>
        <IconButton
          label={open ? "Close menu" : "Open menu"}
          icon={open ? <X aria-hidden /> : <Menu aria-hidden />}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 md:hidden"
        />
      </nav>
      <div id="mobile-menu" hidden={!open} className={cn("border-t border-line bg-bg/95 px-4 pb-4 md:hidden")}>
        <ul className="pt-2">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex h-12 items-center rounded-md px-3 text-base font-semibold text-ink-2 focus-ring hover:bg-tint/[.05] hover:text-ink"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}
