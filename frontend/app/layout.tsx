import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Roboto } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
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
  themeColor: "#070A1A",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${roboto.variable}`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
