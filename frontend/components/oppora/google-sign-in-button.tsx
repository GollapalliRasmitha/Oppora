import { cn } from "@/lib/utils";

export const SIGN_IN_URL = "/api/auth/google/login?next=/dashboard";

/**
 * "Sign in with Google" following Google's branding guidelines: light theme
 * (#FFFFFF fill, #747775 stroke, #1F1F1F text), the standard four-colour G,
 * Roboto Medium, pill shape. A plain link (full navigation) to Django's
 * OAuth start, which redirects to Google's consent screen.
 */
export function GoogleSignInButton({ href = SIGN_IN_URL, className }: { href?: string; className?: string }) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex h-12 items-center gap-3 rounded-full border border-[#747775] bg-white pl-3 pr-5 font-google text-body font-medium text-[#1F1F1F] focus-ring transition-[box-shadow,background-color] duration-200 hover:bg-[#F8FAFF] hover:shadow-[var(--glow-brand)]",
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 48 48" className="size-5">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      Sign in with Google
    </a>
  );
}
