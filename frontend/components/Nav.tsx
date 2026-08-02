"use client";

// Client-side only for the active-route indicator. The nav sits on the page
// ground rather than inside the black bar, so the masthead stays a clean
// brand lockup.
//
// Three tabs, named for what the reader does there rather than for how the
// analysis is organised: read the summary, explore the charts, act on the
// lists. Everything methodological folds into the Overview's evidence
// section, so no tab exists for the system's own machinery.
//
// The active tab is the one persistent yellow mark on a page besides the
// masthead: a 2px underline. It earns the accent because it answers "where
// am I", which is the only question the nav exists to answer.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGrid, IconLayers, IconTag } from "@/components/icons";

const NAV = [
  { href: "/", label: "Overview", Icon: IconGrid },
  { href: "/dashboards", label: "Dashboards", Icon: IconLayers },
  { href: "/actions", label: "Customers & actions", Icon: IconTag },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-line bg-surface">
      <nav
        aria-label="Sections"
        className="mx-auto flex max-w-[104rem] overflow-x-auto px-6"
      >
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`plain -mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-body no-underline transition-colors ${
                active
                  ? "border-yellow font-semibold text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
