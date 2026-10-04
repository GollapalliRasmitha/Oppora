import type { Theme } from "@/lib/domain/types";

/**
 * Theme: the account preference (Preferences.theme) is the source of truth; the
 * browser keeps a copy in localStorage so every page, including the landing
 * page, paints in the right theme before any fetch. The resolved theme is set as
 * <html data-theme="dark|light">, which swaps the design tokens in globals.css.
 */
export const THEME_KEY = "oppora-theme";

/**
 * Runs inline in <head> before first paint (no flash of the wrong theme), then
 * keeps "system" in step with the OS. A static constant: no user input in it.
 */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,m=matchMedia("(prefers-color-scheme: light)");function a(){var t=null;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}var r=t==="light"||(t==="system"&&m.matches)?"light":"dark";d.setAttribute("data-theme",r);d.style.colorScheme=r}a();m.addEventListener("change",a);addEventListener("storage",function(e){if(e.key==="${THEME_KEY}")a()})}catch(e){}})()`;

export function isTheme(v: unknown): v is Theme {
  return v === "dark" || v === "light" || v === "system";
}

export function resolveTheme(t: Theme, prefersLight: boolean): "dark" | "light" {
  return t === "light" || (t === "system" && prefersLight) ? "light" : "dark";
}

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isTheme(v) ? v : "dark";
  } catch {
    return "dark";
  }
}

/** Remembers the choice in this browser and applies it now. */
export function applyTheme(t: Theme) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // Private mode / blocked storage: still apply for this page.
  }
  const prefersLight = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches;
  const r = resolveTheme(t, prefersLight);
  // Swap in one step: without this, every element's colour transition would animate the switch.
  const freeze = document.createElement("style");
  freeze.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(freeze);
  document.documentElement.setAttribute("data-theme", r);
  document.documentElement.style.colorScheme = r;
  void getComputedStyle(document.body).color; // apply the new tokens before transitions return
  requestAnimationFrame(() => freeze.remove());
}
