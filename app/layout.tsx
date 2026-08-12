import type { Metadata } from "next";
import { Caveat, EB_Garamond, Geist, Geist_Mono, Lora, Meddon } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ebGaramond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const meddon = Meddon({
  variable: "--font-meddon",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  // `template` lets individual routes (e.g. /sources) name themselves without
  // restating the project title.
  title: {
    default: "Young Darwin — Floreana, 1835",
    template: "%s",
  },
  description:
    "A playable historical simulation of Charles Darwin's days ashore on Floreana (Charles Island) in September 1835. Observe, collect, travel, and record on an island already being remade.",
  applicationName: "Young Darwin",
  authors: [{ name: "Benjamin Breen", url: "https://benjaminpbreen.com" }],
  openGraph: {
    title: "Young Darwin — Floreana, 1835",
    description:
      "A playable historical simulation of Charles Darwin's days ashore on Floreana (Charles Island) in September 1835.",
    siteName: "Young Darwin",
    type: "website",
    images: [{ url: "/assets/ui/splash-background-1672.webp" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Young Darwin — Floreana, 1835",
    description:
      "A playable historical simulation of Charles Darwin's days ashore on Floreana (Charles Island) in September 1835.",
    images: ["/assets/ui/splash-background-1672.webp"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${ebGaramond.variable} ${lora.variable} ${caveat.variable} ${meddon.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
