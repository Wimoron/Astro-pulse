import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/RegisterSW";
import "./globals.css";

export const metadata: Metadata = {
  title: "AstroPulse · Find the planet hiding in the flicker",
  description:
    "Hunt for exoplanets in telescope-style light curves. Free, open source, no code. Clean the signal, find the orbit, and check if it is really a planet.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AstroPulse", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#050506" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <div className="starfield" aria-hidden="true" />
        <div className="relative z-10 flex min-h-full flex-1 flex-col">{children}</div>
        <RegisterSW />
      </body>
    </html>
  );
}
