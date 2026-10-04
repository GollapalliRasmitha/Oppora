import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Roboto } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

/** Only used by the "Sign in with Google" button (Google branding guidelines). */
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["500"],
});

export const metadata: Metadata = {
  title: { default: "Oppora — Your personal AI opportunity agent", template: "%s · Oppora" },
  description:
    "Oppora uses AI to scan your Gmail, find relevant opportunities, track deadlines and help you stay ahead — all in one place.",
};

export const viewport: Viewport = {
  // Follows the OS; the page itself follows the account's theme (lib/theme.ts).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F5FB" },
    { media: "(prefers-color-scheme: dark)", color: "#070A1A" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set by THEME_SCRIPT before React hydrates, hence suppressHydrationWarning.
    <html lang="en" data-theme="dark" className={`${jakarta.variable} ${roboto.variable}`} suppressHydrationWarning>
      <head>
        {/* Static constant (no user input): applies the saved theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
