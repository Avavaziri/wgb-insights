"use client";

// The dashboard surface: every surviving panel on one page, EACH WITH ITS
// OWN SLICER, plus a page-level "apply to every panel" control and panel
// show/hide toggles.
//
// WHAT A SLICER REALLY DOES. Years are multi-select, like a Power BI
// slicer: none selected means the full period, one means that year's
// slice, two or more means a COMPARISON figure with the years drawn
// together. Every one of those is a parameterised fetch
// (?year= / ?years=) that Python recomputes from the named years' rows.
// Nothing is filtered in the browser: a number computed in TypeScript is
// a defect (CLAUDE.md), so the slicer picks years and the server does the
// arithmetic. Per-panel state is the point - two panels can sit on
// different years so a reader can compare views against each other, not
// just a single global lens.
//
// Only descriptive charts are sliceable; model-backed panels keep the
// full sample (a per-year effect estimate would be a new analysis) and
// say so in place of a slicer, so no one mistakes them for filtered views.
//
// The panel toggles filter the VIEW only: which tiles are on screen.
// Series inside a panel can still be toggled with Plotly's own legend.

import { useEffect, useMemo, useState } from "react";
import PlotlyChart from "@/components/PlotlyChart";
import { TileFooter } from "@/components/ui";
import { API_BASE } from "@/lib/api";

export interface Tile {
  id: string;
  group: string;
  /** Chart name on the API; the tile refetches it when the year changes. */
  chart: string;
  title: string;
  note?: string;
  /** How to read the figure, one breath, for a non-technical reader. */
  read: string;
  /** The single decision the figure informs (or refuses to inform). */
  changes: string;
  /** Full-period figure, fetched server-side for first paint. */
  figure: unknown;
  /** Descriptive chart that accepts ?year= (charts.SLICEABLE). */
  sliceable?: boolean;
  /**
   * Why this panel has no year filter, when the reason is not the default
   * (a model-backed estimate). Shown in place of the filter row, because a
   * missing control needs a reason and the reasons genuinely differ.
   */
  noSlice?: string;
  /** Headline panels span both columns and get the taller box. */
  wide?: boolean;
}

/** Slicer chip: one year, on or off. Multi-select, Power BI style. */
function YearChip({
  label,
  on,
  onClick,
  title,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`border px-2 py-0.5 text-caption font-semibold transition-colors ${
        on
          ? "border-ink bg-ink text-white"
          : "border-line bg-white text-muted hover:border-ink hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function SlicedTile({
  tile,
  years,
  selected,
  onSelect,
}: {
  tile: Tile;
  years: number[];
  /** Years chosen on THIS panel: empty = full period. */
  selected: readonly number[];
  onSelect: (next: number[]) => void;
}) {
  // The displayed figure is DERIVED: the server-fetched full-period figure
  // unless a selection applies, in which case it comes from the slice
  // cache. State changes only happen in fetch callbacks, never
  // synchronously in the effect body.
  const [slices, setSlices] = useState<ReadonlyMap<string, unknown>>(
    new Map(),
  );
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  // memoised: the effect below depends on it, and a fresh array each
  // render would refetch forever
  const picked = useMemo(
    () => (tile.sliceable ? [...selected].sort((a, b) => a - b) : []),
    [tile.sliceable, selected],
  );
  const key = picked.length ? `${tile.chart}:${picked.join(",")}` : null;
  const figure = key ? slices.get(key) : tile.figure;
  const state: "ready" | "loading" | "error" =
    key === null || slices.has(key)
      ? "ready"
      : failed.has(key)
        ? "error"
        : "loading";

  useEffect(() => {
    if (key === null || slices.has(key) || failed.has(key)) return;
    let cancelled = false;
    // one year -> ?year=; several -> ?years=, the comparison figure.
    // Either way Python does the computing.
    const q =
      picked.length === 1
        ? `year=${picked[0]}`
        : `years=${picked.join(",")}`;
    fetch(`${API_BASE}/charts/${tile.chart}?compact=true&${q}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((fig: unknown) => {
        if (!cancelled)
          setSlices((prev) => new Map(prev).set(key, fig));
      })
      .catch(() => {
        if (!cancelled) setFailed((prev) => new Set(prev).add(key));
      });
    return () => {
      cancelled = true;
    };
  }, [key, slices, failed, tile.chart, picked]);

  const toggle = (y: number) =>
    onSelect(
      selected.includes(y)
        ? selected.filter((x) => x !== y)
        : [...selected, y],
    );

  return (
    <div className="border border-line bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-3.5 py-2.5">
        {/* Same semantic role as ui.tsx's PanelHead (a panel title): both
            now text-emphasis, where they had drifted to 13px vs 13.5px
            (found in review). Not literally reusing PanelHead - this
            header also carries the "comparing N" badge PanelHead's meta
            slot doesn't model - but the text itself must match. */}
        <h3 className="text-emphasis font-semibold">{tile.title}</h3>
        <span className="num text-caption text-muted">
          {picked.length > 1 && (
            <span className="mr-2 border border-ink px-1.5 py-px text-micro font-semibold uppercase tracking-[0.05em] text-ink">
              comparing {picked.length}
            </span>
          )}
          {tile.note}
        </span>
      </div>

      {/* THE PANEL'S OWN SLICER. Sliceable panels get years; the rest say
          why they can't be sliced, in place, rather than silently
          ignoring the control. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-hover/40 px-3.5 py-1.5">
        {tile.sliceable ? (
          <>
            <span className="eyebrow mr-0.5">Years</span>
            <YearChip
              label="All"
              on={picked.length === 0}
              onClick={() => onSelect([])}
              title="Full period"
            />
            {years.map((y) => (
              <YearChip
                key={y}
                label={String(y)}
                on={picked.includes(y)}
                onClick={() => toggle(y)}
                title={`Add or remove ${y}; pick two or more to compare`}
              />
            ))}
            <span className="ml-auto text-caption text-muted">
              {picked.length > 1
                ? "compared, recomputed in Python"
                : picked.length === 1
                  ? "one year, recomputed in Python"
                  : "pick two or more to compare"}
            </span>
          </>
        ) : (
          <span className="text-caption text-muted">
            {tile.noSlice ??
              "Full sample always. This panel is model-backed, so a per-year estimate would be a new analysis and not a filter."}
          </span>
        )}
      </div>
      {/* aria-live: a screen-reader user who picks a year hears the swap
          (loading -> chart or error), not just silence where a chart used
          to be. Content only, never a layout container that would also
          announce unrelated re-renders. */}
      <div aria-live="polite">
        {state === "error" ? (
          <p className="px-4 py-8 text-center text-caption text-muted">
            This year&rsquo;s figure did not load. Pick another year or All
            years.
          </p>
        ) : state === "loading" ? (
          <div
            className={`flex w-full items-center justify-center ${tile.wide ? "h-[320px]" : "h-[228px]"}`}
          >
            <span className="flex items-center gap-2.5 text-caption text-muted">
              <span className="size-3 animate-spin rounded-full border-2 border-line border-t-ink" />
              Recomputing {picked.join(" vs ")} in Python
            </span>
          </div>
        ) : (
          <PlotlyChart
            figure={figure}
            compact={!tile.wide}
            tall={tile.wide}
            title={`${tile.title}. ${tile.read}`}
          />
        )}
      </div>
      <TileFooter read={tile.read} changes={tile.changes} />
    </div>
  );
}

export default function DashboardGrid({
  tiles,
  years,
  lead,
}: {
  tiles: Tile[];
  /** Full years plus the partial year, from the API's trend data. */
  years: number[];
  /** Fixed lead panel (the constraint gauge), full width, never hidden. */
  lead?: React.ReactNode;
}) {
  const groups = [...new Set(tiles.map((t) => t.group))];
  const [hidden, setHidden] = useState<string[]>([]);
  // Years chosen PER PANEL, keyed by tile id. Absent = full period.
  const [picked, setPicked] = useState<Record<string, number[]>>({});

  const visible = tiles.filter((t) => !hidden.includes(t.group));
  const toggle = (g: string) =>
    setHidden((h) => (h.includes(g) ? h.filter((x) => x !== g) : [...h, g]));
  const setAll = (ys: number[]) =>
    setPicked(Object.fromEntries(tiles.map((t) => [t.id, ys])));

  return (
    <div className="space-y-3">
      {/* Not visible: PageHeader's h1 is otherwise followed straight by
          each tile's h3 with nothing at h2, which breaks heading-based
          screen-reader navigation (found in review). No visible second
          heading suits this page's design, so this is the sr-only
          landmark WCAG's own technique recommends for that case. */}
      <h2 className="sr-only">Panels and year filters</h2>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-line bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">Panels</span>
          {groups.map((g) => {
            const on = !hidden.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggle(g)}
                aria-pressed={on}
                className={`border px-2.5 py-1 text-caption font-semibold transition-colors ${
                  on
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white text-muted hover:border-ink hover:text-ink"
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
        {/* Convenience only: every panel keeps its own slicer, this just
            sets them together for a quick whole-page view. */}
        <div className="flex flex-wrap items-center gap-2 border-l border-line pl-4">
          <span className="eyebrow mr-1">Set every panel</span>
          <button
            type="button"
            onClick={() => setAll([])}
            className="border border-line bg-white px-2.5 py-1 text-caption font-semibold text-muted transition-colors hover:border-ink hover:text-ink"
          >
            All years
          </button>
          <button
            type="button"
            onClick={() => setAll(years)}
            className="border border-line bg-white px-2.5 py-1 text-caption font-semibold text-muted transition-colors hover:border-ink hover:text-ink"
          >
            Compare every year
          </button>
        </div>
        <span className="ml-auto max-w-[26rem] text-caption text-muted">
          Each panel has its own year filter. Pick one year to slice it, or two
          and more to compare. Python recomputes every figure from the years you
          pick, so nothing is filtered in the browser.
        </span>
      </div>

      {lead}

      {visible.length === 0 ? (
        <p className="border border-line bg-white px-4 py-8 text-center text-body text-muted">
          All panels are hidden. Turn one back on above.
        </p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {visible.map((t) => (
            <div key={t.id} className={t.wide ? "xl:col-span-2" : ""}>
              <SlicedTile
                tile={t}
                years={years}
                selected={picked[t.id] ?? []}
                onSelect={(next) =>
                  setPicked((p) => ({ ...p, [t.id]: next }))
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
