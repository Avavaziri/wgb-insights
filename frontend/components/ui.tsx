// Presentation primitives, built to the W&G Baird *web* design system
// (~/.claude/wgb-web-design-system.md) and its reference stylesheet, the 360
// Jobs dashboard. No data logic lives here: these components receive
// already-formatted strings and arrange them.
//
// THE ORGANISING IDEA is the estimating docket: the ruled form a print job
// is quoted on. Label left, figure right, hairlines between, nothing
// floating. It suits this content exactly, because every screen here is a
// measurement next to the thing that qualifies it, and it spends almost no
// colour, which is the brief.
//
// The rules that shape every component below:
//   · --ink (#3F454D) for all structure; true black only in the masthead.
//   · Yellow is the accent SYSTEM (see globals.css): the section rail,
//     KPI top borders, the active nav underline, chart outlines. Always
//     a thin line, never a surface and never a data fill.
//   · Uppercase for eyebrows, labels and chips only.
//   · Structure comes from rules and fills, never elevation. Radius 0.
//   · White ground, air. Dark fills are rationed: the masthead, chips,
//     and nothing that spans the page (the ink table-header bars went;
//     they made every table a dark stripe and the page read as print).
//
// ONE DELIBERATE DEPARTURE from the house recipe: a panel there is a 1.5px
// border with an ink-filled header bar. Filled bars survive here on table
// headers only, where they separate labels from data and anchor a long
// column. On a dashboard of eight figure tiles they became eight dark
// stripes down the page, which is the "too busy" this redesign answers.
// Chart panels get a hairline header row instead.

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Chip weight, named for what it means rather than for a status.
 *
 * `solid`   the thing stands, or needs acting on. Filled ink.
 * `outline` the thing is qualified: provisional, excluded, or recorded with
 *             no action. A hairline box.
 *
 * The house recipe fills the attention state with yellow, which worked when
 * a view held three chips. It does not survive here, where the call list can
 * render fifty in one table and the register another thirteen, so weight
 * carries the difference and the accent is spent on the one mark that is
 * measuring something.
 *
 * Getting this the wrong way round is a real bug and it happened once: with
 * yellow gone, the old names left "watch, no action needed" filled and
 * "high risk" outlined, so the quiet rows shouted.
 */
export type ChipTone = "solid" | "outline";

/*
 * There is no hover-reveal on this site any more. Detail is disclosed by
 * CLICK (native <details>, see Evidence and Disclosure below), because the
 * app is demonstrated in a screen recording to a non-technical board: a
 * click is deliberate and visible on camera, a hover state is neither, and
 * information that only exists under a pointer is information the video
 * never shows. Caveat lines are simply always visible.
 */

/* ------------------------------------------------------------------ page */

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

export function MetaSep() {
  return (
    <span aria-hidden className="text-line">
      /
    </span>
  );
}

/**
 * Page head, dashboard register: a slim bar, not a chapter opening. Title
 * left, live metadata right on the same line, closed by the house 2px ink
 * rule. The rule is plain ink on purpose: the nav above already spends the
 * page's functional accent. Ledes are one short line when present at all;
 * anything longer belongs in a caption next to the thing it qualifies.
 */
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
    <header className="border-b-2 border-ink pb-3">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div className="min-w-0">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-1 text-[23px] sm:text-[26px]">{title}</h1>
        </div>
        {meta && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-0.5 text-[12px] text-muted">
            {meta}
          </div>
        )}
      </div>
      {lede && (
        <p className="measure mt-2 text-[13px] leading-relaxed text-muted">
          {lede}
        </p>
      )}
    </header>
  );
}

/**
 * Section opening, Tender Assistant register: the 4px yellow rail against
 * a bold heading, one grey helper line under it. The note is a qualifier,
 * not an introduction: if it needs a second sentence it belongs in a
 * table caption or an evidence fold, not up here.
 */
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
    <section className="space-y-3">
      <div className="rail">
        <h2 className="text-[19px]">
          {kicker && <span className="eyebrow mr-3 align-[3px]">{kicker}</span>}
          {title}
        </h2>
        {note && (
          <p className="mt-1 max-w-[80ch] text-[12.5px] leading-snug text-muted">
            {note}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- surface */

/** The workhorse container: a hairline box on white. */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-line bg-white ${className}`}>{children}</div>
  );
}

/** Panel header: a hairline row, the title in Inter, an optional right-hand
    figure. Quiet enough to repeat eight times down a dashboard. */
export function PanelHead({
  children,
  meta,
}: {
  children: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2.5">
      <h3 className="text-[13.5px] font-semibold">{children}</h3>
      {meta && <span className="num text-[12px] text-muted">{meta}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ KPIs */

/**
 * The KPI cards, straight off the Tender Assistant: separate white cards
 * with a hairline border and a 2px yellow top border, uppercase grey
 * label, big bold figure. The first thing on a dashboard after the
 * controls. Every value arrives from the API already computed; a card
 * links to the surface that argues it.
 */
export function KpiBand({
  cols = "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
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
  sub,
  href,
}: {
  label: string;
  value: string;
  /** One short qualifying line, always visible: a caption, not a caveat
      essay. The full statistics live behind the linked surface. */
  sub?: string;
  href?: string;
}) {
  const box =
    "border border-line border-t-2 border-t-yellow bg-white px-4 py-3";
  const inner = (
    <>
      <span className="eyebrow block text-[10px] leading-tight">{label}</span>
      <span className="num mt-1.5 block text-[26px] font-bold tracking-[-0.02em]">
        {value}
      </span>
      {sub && (
        <span className="mt-1 block text-[11.5px] leading-snug text-muted">
          {sub}
        </span>
      )}
    </>
  );
  return href ? (
    <Link
      href={href}
      className={`plain block no-underline transition-colors hover:bg-hover ${box}`}
    >
      {inner}
    </Link>
  ) : (
    <div className={box}>{inner}</div>
  );
}

/* ------------------------------------------------------------- evidence */

/**
 * The reporting-standards block: an effect never appears without its CI, p,
 * n and SE type, and each travels in its own labelled cell rather than
 * buried in a sentence. `frame=false` when a parent (Evidence) already
 * supplies the border.
 */
export interface ReadoutItem {
  label: string;
  value: string;
  tone?: "default" | "mono";
}

export function Readout({
  items,
  frame = true,
}: {
  items: ReadoutItem[];
  frame?: boolean;
}) {
  return (
    <dl
      className={`m-0 grid divide-line bg-white sm:grid-cols-2 sm:divide-x lg:grid-cols-3 xl:grid-cols-6 ${
        frame ? "border border-line" : ""
      }`}
    >
      {items.map((it) => (
        <div key={it.label} className="px-4 py-3">
          <dt className="eyebrow text-[10px] leading-tight">{it.label}</dt>
          <dd
            className={`num mt-1.5 ${
              it.tone === "mono"
                ? "font-mono text-[11.5px] leading-snug text-muted"
                : "text-[15px] font-semibold"
            }`}
          >
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A statistical readout folded behind one click. The figure and its plain
 * English stay on screen; the CI, p, n and SE type live here, so a board
 * reads the point and an analyst opens the proof. Native <details>: no
 * animation, keyboard-operable, present in the accessibility tree.
 */
export function Evidence({
  items,
  label = "Statistical evidence",
  children,
}: {
  items?: ReadoutItem[];
  label?: string;
  children?: ReactNode;
}) {
  return (
    <details className="group border border-line bg-white">
      <summary className="flex cursor-pointer items-center gap-2 px-3.5 py-2 text-[12.5px] font-semibold text-muted hover:bg-hover hover:text-ink">
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="size-2.5 shrink-0 transition-transform duration-150 group-open:rotate-90"
        >
          <path d="M4 2l5 4-5 4z" fill="currentColor" />
        </svg>
        {label}
      </summary>
      <div className="space-y-3 border-t border-line p-3">
        {items && <Readout items={items} frame={false} />}
        {children}
      </div>
    </details>
  );
}

/**
 * A short written result: a chip, a claim with its figure inline, and the
 * reasoning under it. Used for the results that were computed and then
 * held back, where the prose is the point and there is nothing to plot.
 */
export function NoteCard({
  chip,
  tone = "outline",
  claim,
  children,
}: {
  chip: string;
  tone?: ChipTone;
  claim: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border border-line bg-white p-4">
      <Chip tone={tone}>{chip}</Chip>
      <p className="mt-3 text-[14.5px] font-semibold leading-snug">{claim}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ chips */

export function Chip({
  children,
  tone = "solid",
}: {
  children: ReactNode;
  tone?: ChipTone;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap border border-ink px-2 py-[2px] text-[10.5px] font-bold tracking-[0.05em] ${
        tone === "outline" ? "bg-white text-ink" : "bg-ink text-white"
      }`}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- callouts */

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
    <details className="group border border-line bg-white">
      <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 text-[14px] font-semibold hover:bg-hover">
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
      <div className="space-y-3 border-t border-line p-4">{children}</div>
    </details>
  );
}

/** Label/value rows inside a panel: counts, checks and caveats. */
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
            <dd className="num shrink-0 text-[13px] font-semibold">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ---------------------------------------------------------------- buttons */

/** Square, hairline-bordered, white at rest, yellow on hover. The accent
    is free here because it only exists while the pointer is on it. */
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
      className={`plain inline-flex items-center gap-2 border-[1.5px] border-ink px-4 py-2 text-[13px] font-semibold no-underline transition-colors ${
        primary
          ? "bg-ink text-white hover:bg-yellow hover:text-ink"
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
      {caption && (
        <p className="measure text-[12px] leading-relaxed text-muted">
          {caption}
        </p>
      )}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <table className="w-full border-collapse text-[13.5px]">{children}</table>
  );
}

/** Light table header, Tender Assistant register: uppercase grey label on
    white over a 2px ink rule. The old ink-filled bar made every table a
    dark stripe and the page read as newsprint; the rule anchors a column
    just as firmly without the weight. */
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
      className={`whitespace-nowrap border-b-2 border-ink bg-white px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted ${
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
  /** Marks a row structurally: a thick ink left rule, not a fill. */
  highlight?: boolean;
}) {
  return (
    <tr
      className={`hover:[&>td]:bg-hover ${
        highlight
          ? "[&>td:first-child]:border-l-[3px] [&>td:first-child]:border-l-ink [&>td]:font-semibold"
          : ""
      }`}
    >
      {children}
    </tr>
  );
}
