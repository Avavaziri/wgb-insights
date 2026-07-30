// Presentation primitives, built to the W&G Baird *web* design system
// (~/.claude/wgb-web-design-system.md) and its reference stylesheet, the 360
// Jobs dashboard. No data logic lives here — these components receive
// already-formatted strings and arrange them.
//
// The rules that shape every component below:
//   · --ink (#3F454D) for all structure; true black only in the masthead.
//   · Yellow is a highlight, not a surface — roughly one yellow thing per
//     view, so it means "look here" rather than "this is branded".
//   · Uppercase for eyebrows, labels and chips only.
//   · Structure comes from rules and fills, never elevation. Radius 0.

import Link from "next/link";
import type { ReactNode } from "react";

export type ChipTone = "done" | "now";

/**
 * The one micro-interaction on the site, used on exactly two components.
 *
 * WIPE   — a 2px rule that draws itself in from the left. The whole analysis
 *          is about lines (a crossover, a benchmark, a cut-off), so a rule
 *          that draws in is the subject's own vocabulary, not a generic fade.
 * REVEAL — the qualification behind a figure, collapsed with max-height so it
 *          stays in the DOM and in the accessibility tree.
 *
 * Both fire on group-hover AND group-focus-within, which is why every tile
 * using them is a link: the keyboard reaches exactly what the mouse does.
 * Reduced motion is handled globally — the transition drops out and the
 * reveal becomes an instant toggle.
 */
const WIPE =
  // opacity as well as scale: a 2px block scaled to zero still leaves a
  // sub-pixel sliver of colour in the corner on some displays.
  "block h-[2px] origin-left scale-x-0 opacity-0 transition-[transform,opacity] duration-150 " +
  "group-hover:scale-x-100 group-hover:opacity-100 " +
  "group-focus-within:scale-x-100 group-focus-within:opacity-100";

const REVEAL =
  "block max-h-0 overflow-hidden opacity-0 transition-[max-height,opacity] duration-150 " +
  "group-hover:max-h-40 group-hover:opacity-100 " +
  "group-focus-within:max-h-40 group-focus-within:opacity-100";

/* ------------------------------------------------------------------ page */

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

/** Page head: eyebrow, serif h1, and the 2px ink underline the house system
    uses to close it off (`--featured`). */
export function PageHeader({
  eyebrow,
  title,
  lede,
  meta,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="space-y-2.5 border-b border-line pb-5">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="max-w-4xl text-[26px] sm:text-[30px]">{title}</h1>
      {lede && <p className="measure text-[15px] leading-relaxed">{lede}</p>}
      {meta && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          {meta}
        </div>
      )}
    </header>
  );
}

export function MetaSep() {
  return (
    <span aria-hidden className="text-line">
      /
    </span>
  );
}

export function Section({
  title,
  kicker,
  note,
  children,
}: {
  title: string;
  kicker?: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="rail space-y-1">
        {kicker && <Eyebrow>{kicker}</Eyebrow>}
        <h2 className="max-w-3xl text-[19px]">{title}</h2>
        {note && (
          <p className="measure pt-0.5 text-[13.5px] leading-relaxed text-muted">
            {note}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- surface */

/** The workhorse container: 1.5px ink border, filled header bar. */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`border-[1.5px] border-ink bg-white ${className}`}>
      {children}
    </div>
  );
}

export function PanelHead({
  children,
  meta,
}: {
  children: ReactNode;
  /** Right-hand note — yellow bold, per the house panel recipe. */
  meta?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 bg-ink px-4 py-3 text-white">
      <h3 className="text-[16px] font-medium tracking-normal">{children}</h3>
      {meta && (
        <span className="num text-[12px] font-bold text-yellow">{meta}</span>
      )}
    </div>
  );
}

/**
 * KPI row: hairline gaps over an ink ground so the gaps themselves become
 * the dividing rules, inside a 2px ink border.
 */
export function KpiRow({
  cols = "sm:grid-cols-2 lg:grid-cols-4",
  children,
}: {
  cols?: string;
  children: ReactNode;
}) {
  return <div className={`grid gap-3 ${cols}`}>{children}</div>;
}

export function Kpi({
  label,
  value,
  detail,
  href,
  /** The one figure in a group that is the point. Yellow tile, hovering to
      white — hovering to ink would hide its own label. */
  accent = false,
  /** Board view: hold the caveat back until hover or keyboard focus. Only
      use with `href`, so the tile is focusable and the keyboard can reach
      what the mouse can. */
  reveal = false,
}: {
  label: string;
  value: string;
  detail?: string;
  href?: string;
  accent?: boolean;
  reveal?: boolean;
}) {
  const surface = accent ? "bg-yellow" : "bg-white hover:bg-hover";

  const inner = (
    <>
      <span className="eyebrow block text-[10px]">{label}</span>
      <span className="display mt-1 block text-[27px]">{value}</span>
      {reveal && <span aria-hidden className={`${WIPE} mt-2 bg-yellow`} />}
      {detail &&
        (reveal ? (
          <span className={REVEAL}>
            <span className="mt-2 block text-[12px] leading-snug text-ink">
              {detail}
            </span>
          </span>
        ) : (
          <span
            className={`mt-2 block text-[12px] leading-snug ${accent ? "text-ink" : "text-muted"}`}
          >
            {detail}
          </span>
        ))}
    </>
  );

  // A compact card with its own hairline and a 2px yellow rule on top: six of
  // these fit a row without the KPI strip eating the page.
  const box =
    `group block border border-line border-t-2 border-t-yellow px-4 py-3 ` +
    `transition-colors ${surface}`;

  return href ? (
    <Link href={href} className={`plain no-underline ${box}`}>
      {inner}
    </Link>
  ) : (
    <div className={box}>{inner}</div>
  );
}

/**
 * Signpost: the house device for the one thing on a page that must not be
 * missed. Yellow ground, 2px ink border, serif line, and a bordered "go"
 * label. This is the page's single yellow surface.
 */
export function Signpost({
  eyebrow,
  headline,
  sub,
  href,
  go,
}: {
  eyebrow: string;
  headline: string;
  sub: string;
  href: string;
  go: string;
}) {
  return (
    <Link
      href={href}
      className="plain group flex flex-wrap items-center justify-between gap-4 border-2 border-ink bg-yellow px-6 py-4 text-ink no-underline hover:bg-ink hover:text-white focus-visible:outline-ink"
    >
      <span className="min-w-0">
        <span className="eyebrow block text-ink group-hover:text-yellow">
          {eyebrow}
        </span>
        <strong className="display mt-1 block text-[19px] font-normal">
          {headline}
        </strong>
        <span className="mt-1 block text-[13px]">{sub}</span>
      </span>
      <span className="eyebrow shrink-0 border-[1.5px] border-current px-4 py-2 text-current">
        {go}
      </span>
    </Link>
  );
}

/**
 * One conclusion: verdict chip, the claim, the figure that carries it, one
 * line of qualification, and the page where it is argued in full.
 */
export function FindingCell({
  verdict,
  tone,
  claim,
  figure,
  figureLabel,
  detail,
  href,
  linkLabel,
}: {
  verdict: string;
  tone: ChipTone;
  claim: string;
  figure: string;
  figureLabel: string;
  detail: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <Link
      href={href}
      className="plain group flex flex-col gap-2.5 border border-line bg-white p-4 no-underline transition-colors hover:bg-hover"
    >
      <span aria-hidden className={`${WIPE} bg-yellow`} />
      <span>
        <Chip tone={tone}>{verdict}</Chip>
      </span>
      <h3 className="text-[15px] font-semibold">{claim}</h3>
      <span>
        <span className="display block text-[30px]">{figure}</span>
        <span className="eyebrow mt-1 block text-[10px]">{figureLabel}</span>
      </span>
      {/* The qualification is the analyst's half of the sentence — held back
          so the board reads four conclusions, not four paragraphs. */}
      <span className={REVEAL}>
        <span className="block pt-1 text-[13px] leading-snug text-ink">
          {detail}
        </span>
      </span>
      <span className="mt-auto pt-1 text-[13px] font-semibold underline underline-offset-2">
        {linkLabel}
      </span>
    </Link>
  );
}

/* --------------------------------------------------------------- readouts */

export interface ReadoutItem {
  label: string;
  value: string;
  tone?: "default" | "mono";
}

/**
 * The reporting-standards component, built as the house definition grid: an
 * effect never appears without its CI, p, n and SE type, and each travels in
 * its own labelled cell rather than buried in a sentence.
 */
export function Readout({ items }: { items: ReadoutItem[] }) {
  return (
    <Panel>
      <dl className="m-0 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {items.map((it) => (
          <div key={it.label} className="border-t border-line pt-2">
            <dt className="eyebrow text-[10px]">{it.label}</dt>
            <dd
              className={`num mt-0.5 ${
                it.tone === "mono"
                  ? "font-mono text-[12px] leading-snug text-muted"
                  : "text-[15px] font-medium"
              }`}
            >
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ------------------------------------------------------------------ chips */

/** Status chip: done is filled ink, "now" (needs attention) is filled
    yellow — the same logic the house system uses for flashes, where a
    warning is a "do this next" rather than an emergency. */
export function Chip({
  children,
  tone = "done",
}: {
  children: ReactNode;
  tone?: ChipTone;
}) {
  return (
    <span
      className={`inline-block border border-ink px-2 py-[2px] text-[11px] font-bold tracking-[0.04em] whitespace-nowrap ${
        tone === "now" ? "bg-yellow text-ink" : "bg-ink text-white"
      }`}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- callouts */

/**
 * Flash: a qualifier attached to a number. "attention" is ink on yellow
 * with a thick ink left rule; "settled" is white on ink with a yellow left
 * rule. No red anywhere — it is not in the palette.
 */
export function Callout({
  label,
  tone = "attention",
  children,
}: {
  label: string;
  tone?: "attention" | "settled";
  children: ReactNode;
}) {
  return (
    <div
      className={`border-l-8 px-4 py-3 ${
        tone === "attention"
          ? "border-ink bg-yellow text-ink"
          : "border-yellow bg-ink text-white"
      }`}
    >
      <p className="eyebrow text-current">{label}</p>
      <p className="measure mt-1 text-[14px] leading-relaxed">{children}</p>
    </div>
  );
}

export function Disclosure({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <details className="group border-[1.5px] border-ink bg-white">
      <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 text-[15px] font-semibold hover:bg-hover">
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="size-3 shrink-0 transition-transform duration-150 group-open:rotate-90"
        >
          <path d="M4 2l5 4-5 4z" fill="currentColor" />
        </svg>
        <span className="flex-1">{title}</span>
        {hint && (
          <span className="text-[12px] font-normal text-muted">{hint}</span>
        )}
      </summary>
      <div className="space-y-4 border-t border-line p-4">{children}</div>
    </details>
  );
}

/** Label/value rows inside a panel — counts, checks and caveats. */
export function DefList({
  title,
  rows,
}: {
  title: string;
  rows: { label: ReactNode; value: ReactNode }[];
}) {
  return (
    <Panel>
      <PanelHead>{title}</PanelHead>
      <dl className="m-0 divide-y divide-line">
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-baseline justify-between gap-4 px-4 py-2.5"
          >
            <dt className="text-[13px] leading-snug">{r.label}</dt>
            <dd className="num shrink-0 text-[13px] font-semibold">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ---------------------------------------------------------------- buttons */

export function LinkButton({
  href,
  children,
  download,
  primary = false,
}: {
  href: string;
  children: ReactNode;
  download?: string;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      download={download}
      className={`plain inline-flex items-center gap-2 border-[1.5px] border-ink px-4 py-2 text-[13.5px] font-semibold no-underline ${
        primary
          ? "bg-yellow text-ink hover:bg-ink hover:text-white"
          : "bg-white text-ink hover:bg-yellow"
      }`}
    >
      {children}
    </a>
  );
}

/* ----------------------------------------------------------------- tables */

export function TableFrame({
  children,
  caption,
}: {
  children: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Panel>
        <div className="overflow-x-auto">{children}</div>
      </Panel>
      {caption && <p className="measure text-[12px] text-muted">{caption}</p>}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return <table className="w-full border-collapse text-[14px]">{children}</table>;
}

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap bg-ink px-3 py-2 text-[11px] font-medium tracking-[0.04em] text-white ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  num = false,
  muted = false,
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  num?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`border-b border-line px-3 py-2 align-top ${
        align === "right" ? "text-right" : "text-left"
      } ${num ? "num" : ""} ${muted ? "text-muted" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

/**
 * Row hover is neutral grey, never yellow: on a long table a yellow row
 * lights the whole line up and makes scanning exhausting. This is the one
 * place the brand yellow is deliberately dialled back, and re-introducing
 * it here is a known regression.
 */
export function Tr({
  children,
  highlight = false,
}: {
  children: ReactNode;
  /** Marks a row structurally — a thick ink left rule, not a fill. */
  highlight?: boolean;
}) {
  return (
    <tr
      className={`hover:[&>td]:bg-hover ${
        highlight ? "[&>td:first-child]:border-l-4 [&>td:first-child]:border-l-ink [&>td]:font-semibold" : ""
      }`}
    >
      {children}
    </tr>
  );
}
