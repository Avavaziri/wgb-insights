"use client";

// Client-side only for the active-route indicator. The nav sits on the page
// ground rather than inside the black bar, so the masthead stays a clean
// brand lockup.
//
// "Method & data" is the discovery tab: every statement about how the system
// works — standards, ingest checks, the hypothesis register, the API — lives
// there, off the pages a manager reads for conclusions.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconChecklist,
  IconClock,
  IconGrid,
  IconLayers,
  IconPress,
  IconTag,
} from "@/components/icons";

const NAV = [
  { href: "/", label: "Overview", Icon: IconGrid },
  { href: "/margin", label: "Where margin lives", Icon: IconLayers },
  { href: "/pricing", label: "Pricing & overrides", Icon: IconTag },
  { href: "/constraint", label: "Size & the constraint", Icon: IconPress },
  { href: "/retention", label: "Retention risk", Icon: IconClock },
  { href: "/method", label: "Method & data", Icon: IconChecklist },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-line bg-white">
      <nav
        aria-label="Sections"
        className="mx-auto flex max-w-[104rem] gap-1 overflow-x-auto px-6"
      >
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`plain -mb-px flex items-center gap-2 whitespace-nowrap border-b-[3px] px-3 py-2.5 text-[13.5px] no-underline transition-colors ${
                active
                  ? "border-yellow font-semibold text-ink"
                  : "border-transparent text-muted hover:border-line hover:text-ink"
              }`}
            >
              <Icon className="size-[18px] shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
