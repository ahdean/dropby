import type { Metadata, Viewport } from "next";
import { Press_Start_2P, VT323 } from "next/font/google";
import { ServiceWorker } from "@/components/shell/ServiceWorker";
import { ThemeSync } from "@/components/shell/theme";
import { DEFAULT_THEME, THEME_BOOT_SCRIPT } from "@/lib/themes";
import "./globals.css";

// Pixel fonts, downloaded at build time and served from this site (no requests to Google at runtime).
const display = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press-start", display: "swap" });
const body = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt323", display: "swap" });

export const metadata: Metadata = {
  title: { default: "wheet", template: "%s · wheet" },
  description: "See when your friends are free and what they're hosting, at a glance.",
  applicationName: "wheet",
  appleWebApp: { capable: true, title: "wheet", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  // Browser tab and home screens: the line-drawn mara face (drawn by scripts/make-icons.ts).
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#03040a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The saved design is applied by the script below before the page is drawn,
    // so the server's default may differ from what the browser shows.
    <html lang="en" data-theme={DEFAULT_THEME} className={`${display.variable} ${body.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <ServiceWorker />
        <ThemeSync />
      </body>
    </html>
  );
}
