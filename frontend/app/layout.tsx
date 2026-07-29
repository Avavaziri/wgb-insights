import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "wgb-insights",
  description:
    "Dynamic analytics over W&G Baird print-job sales data — contribution per constraint-hour, pricing governance, retention.",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/margin", label: "Where margin lives" },
  { href: "/pricing", label: "Pricing & overrides" },
  { href: "/constraint", label: "Size & the constraint" },
  { href: "/retention", label: "Retention risk" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* Deliberately single-theme: the brand is flat white/black/yellow. */}
      <body className="min-h-screen bg-white font-sans text-black antialiased">
        <header className="border-b-4 border-[#FFE600] bg-black text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-baseline gap-x-8 gap-y-2 px-6 py-4">
            <span className="text-2xl font-black tracking-tight">
              wgb<span className="text-[#FFE600]">-</span>insights
            </span>
            <nav className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-bold uppercase tracking-wide">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="hover:text-[#FFE600] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFE600]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto hidden text-xs text-neutral-400 sm:block">
              Python is the source of truth — this UI renders JSON.
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">{children}</main>
        <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-500">
          Local analysis system — no deployment, no auth. API docs at{" "}
          <a className="underline" href="http://localhost:8000/docs">
            localhost:8000/docs
          </a>
        </footer>
      </body>
    </html>
  );
}
