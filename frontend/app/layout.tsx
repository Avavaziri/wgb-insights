import type { Metadata } from "next";
import Image from "next/image";
import { Inter } from "next/font/google";
import { HeronWatermark } from "@/components/Heron";
import Nav from "@/components/Nav";
import "./globals.css";

// One face, weights carry the hierarchy, matching the Tender Assistant, the
// other W&G Baird internal app. The web design system nominates Fraunces for
// display; it was tried here and read as decoration at dashboard sizes, so
// this project stays sans-only. Noted as a deliberate departure.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body-src",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sales Insights | W&G Baird",
  description:
    "Print-job sales analysis: contribution per press-hour, pricing governance and retention.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="plain sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>

        {/* Masthead lockup: yellow-tile badge, app name, workspace descriptor,
            heritage mark right. True black lives here and nowhere else, and
            the yellow rule under it closes the bar. */}
        <header className="border-b-4 border-yellow bg-black text-white">
          <div className="mx-auto flex max-w-[104rem] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
            <Image
              src="/brand/badge-yellow-tile.png"
              alt="W&G Baird"
              width={74}
              height={58}
              priority
              className="h-[58px] w-auto"
            />
            <span className="leading-tight">
              <span className="block text-[26px] font-bold tracking-[-0.015em]">
                Sales Insights
              </span>
              <span className="eyebrow block text-[10.5px] text-white/70">
                Margin &amp; capacity analysis
              </span>
            </span>
            <span className="eyebrow ml-auto hidden text-[11px] text-white lg:block">
              Printing since <span className="text-yellow">1862</span>
            </span>
          </div>
        </header>

        <Nav />

        <main id="main" className="mx-auto max-w-[104rem] space-y-9 px-6 py-7">
          {children}
        </main>

        <HeronWatermark />

        <footer className="relative z-10 mt-6 border-t border-line py-6">
          <div className="mx-auto max-w-[104rem] px-6 text-[12px] text-muted">
            W&amp;G Baird internal analysis. Figures are computed from the
            uploaded sales extract; this sample covers part of company turnover
            and nothing here extrapolates to company totals.
          </div>
        </footer>
      </body>
    </html>
  );
}
