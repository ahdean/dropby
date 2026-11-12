import type { Metadata, Viewport } from "next";
import { Press_Start_2P, VT323 } from "next/font/google";
import { ServiceWorker } from "@/components/shell/ServiceWorker";
import "./globals.css";

// Pixel fonts, downloaded at build time and served from this site (no requests to Google at runtime).
const display = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press-start", display: "swap" });
const body = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt323", display: "swap" });

export const metadata: Metadata = {
  title: { default: "dropby", template: "%s · dropby" },
  description: "See when your friends are free and what they're hosting, at a glance.",
  applicationName: "dropby",
  appleWebApp: { capable: true, title: "dropby", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  // The browser-tab icon comes from app/icon.png; these are for home screens.
  icons: {
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
    <html lang="en" className={`${display.variable} ${body.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
