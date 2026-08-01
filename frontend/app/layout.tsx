import type { Metadata } from "next";
import Image from "next/image";
import { Inter } from "next/font/google";
import { HeronWatermark } from "@/components/Heron";
import Nav from "@/components/Nav";
import "./globals.css";

// One face, weights carry the hierarchy, matching the Tender Assistant.
// Fraunces was tried for display twice and read as editorial print both
// times; bold Inter is what makes this read as software.
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
      {/* suppressHydrationWarning: browser extensions (password managers,
          unit converters) inject attributes into <body> before React
          hydrates, tripping a false mismatch warning in dev. Suppression
          is one element deep only, so real mismatches in children still
          surface. */}
      <body className="min-h-screen" suppressHydrationWarning>
        <a
          href="#main"
          className="plain sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>

        {/* Masthead: the Tender Assistant lockup. Black bar (the only true
            black on the site), yellow-tile badge, bold title over a grey
            uppercase descriptor, heritage line right with the year in
            yellow, and the yellow rule closing the bar. */}
        <header className="border-b-[3px] border-yellow bg-black text-white">
          <div className="mx-auto flex max-w-[104rem] flex-wrap items-center gap-x-5 gap-y-3 px-6 py-3">
            <Image
              src="/brand/badge-yellow-tile.png"
              alt="W&G Baird"
              width={74}
              height={58}
              priority
              className="h-[50px] w-auto"
            />
            <span className="leading-tight">
              <span className="block text-heading font-bold tracking-[-0.01em]">
                Sales Insights
              </span>
              <span className="eyebrow block text-white/60">
                Margin &amp; capacity workspace
              </span>
            </span>
            <span className="eyebrow ml-auto hidden text-white lg:block">
              Printing since <span className="text-yellow">1862</span>
            </span>
          </div>
        </header>

        <Nav />

        <main id="main" className="mx-auto max-w-[104rem] space-y-6 px-6 py-6">
          {children}
        </main>

        <HeronWatermark />

        <footer className="relative z-10 mt-4 border-t border-line py-6">
          <div className="mx-auto max-w-[104rem] px-6 text-caption leading-relaxed text-muted">
            W&amp;G Baird internal analysis. Figures are computed from the
            uploaded sales extract; this sample covers part of company turnover
            and nothing here extrapolates to company totals.
          </div>
        </footer>
      </body>
    </html>
  );
}
