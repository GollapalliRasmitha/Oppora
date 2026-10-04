import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, resolveTheme, storedTheme, THEME_KEY, THEME_SCRIPT } from "@/lib/theme";

type Listener = () => void;
let prefersLight = false;
let listeners: Listener[] = [];

beforeEach(() => {
  prefersLight = false;
  listeners = [];
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return prefersLight;
      },
      addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    })),
  );
});
afterEach(() => vi.unstubAllGlobals());

const runScript = () => new Function(THEME_SCRIPT)();
const theme = () => document.documentElement.getAttribute("data-theme");

describe("theme", () => {
  it("resolves dark, light and system", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
  });

  it("the head script defaults to dark and applies the stored theme", () => {
    runScript();
    expect(theme()).toBe("dark");
    localStorage.setItem(THEME_KEY, "light");
    runScript();
    expect(theme()).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("System follows the OS, including live changes", () => {
    localStorage.setItem(THEME_KEY, "system");
    runScript();
    expect(theme()).toBe("dark");
    prefersLight = true;
    listeners.forEach((fn) => fn());
    expect(theme()).toBe("light");
  });

  it("ignores junk in storage", () => {
    localStorage.setItem(THEME_KEY, "neon");
    runScript();
    expect(theme()).toBe("dark");
    expect(storedTheme()).toBe("dark");
  });

  it("applyTheme remembers the choice and applies it", () => {
    applyTheme("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(theme()).toBe("light");
    applyTheme("dark");
    expect(theme()).toBe("dark");
  });

  it("the light theme overrides every colour token (one token set, two values)", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    const block = (sel: string) => css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
    const names = (s: string) => new Set([...s.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]));
    const dark = names(block(":root {"));
    const light = names(block(':root[data-theme="light"] {'));
    // Theme-independent tokens: layout, the brand/AI gradients (white text on brand passes in both).
    const shared = new Set(["--sidebar-w", "--sidebar-w-collapsed", "--fab-clearance", "--grad-brand", "--grad-ai-border"]);
    const missing = [...dark].filter((n) => !shared.has(n) && !light.has(n));
    expect(missing).toEqual([]);
    expect([...light].filter((n) => !dark.has(n))).toEqual([]);
  });
});
