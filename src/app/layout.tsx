import type { Metadata, Viewport } from "next";
import { Archivo_Black, Figtree } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const display = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display-loaded",
});

const body = Figtree({
  subsets: ["latin"],
  variable: "--font-body-loaded",
});

export const metadata: Metadata = {
  title: "Plastics Shift — B Shift Planner",
  description:
    "Offline-first B Shift planner for Plastics 2-2-3 rota. Alarms, reminders, overtime and pay tracking.",
  applicationName: "Plastics Shift",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Plastics Shift",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f1412",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`h-full ${display.variable} ${body.variable}`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
