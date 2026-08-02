import type { Metadata } from "next";
import Image from "next/image";
import { Inter } from "next/font/google";
import Nav from "@/components/Nav";
import ThemeToggle from "@/components/ThemeToggle";
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
    // data-theme is stamped here so the server-rendered HTML is already
    // dark, the default. The script below upgrades it to a stored choice
    // BEFORE hydration, so React's server snapshot ("dark") can legally
    // disagree with the DOM it hydrates into ("light", if stored):
    // suppressHydrationWarning covers exactly this attribute, one element
    // deep, and nothing below it.
    <html
      lang="en"
      className={inter.variable}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        {/*
          Applies a saved theme BEFORE first paint, so a light-theme user
          never sees a dark flash. It has to be an inline blocking script:
          anything in React runs after paint, by which point the flash has
          already happened. A plain <script> rather than next/script:
          beforeInteractive does not support inline bodies in the App
          Router, and React never executes script tags it client-renders,
          so next/script here both warned in dev and silently did nothing
          on client navigations. Reads only its own key, writes only the
          attribute, and swallows errors so a blocked localStorage (private
          mode, hardened browser) falls through to the dark default rather
          than throwing before the app mounts.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('wgb-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}`,
          }}
        />
      </head>
      {/* suppressHydrationWarning: browser extensions (password managers,
          unit converters) inject attributes into <body> before React
          hydrates, tripping a false mismatch warning in dev. Suppression
          is one element deep only, so real mismatches in children still
          surface. */}
      <body className="min-h-screen" suppressHydrationWarning>
        <a
          href="#main"
          className="plain sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-canvas"
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
            {/* ml-auto on the group, so the heritage line can drop away on
                small screens without the toggle drifting left. */}
            <div className="ml-auto flex items-center gap-5">
              <span className="eyebrow hidden text-white lg:block">
                Printing since <span className="text-yellow">1862</span>
              </span>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <Nav />

        <main id="main" className="mx-auto max-w-[104rem] space-y-6 px-6 py-6">
          {children}
        </main>

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
