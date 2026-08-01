"use client";

// The dashboard surface: every surviving panel on one page, a year slicer,
// and panel show/hide toggles.
//
// WHAT THE YEAR SLICER REALLY DOES. Selecting a year refetches the
// sliceable panels from the API with ?year=YYYY, and Python recomputes
// those figures from that year's rows. Nothing is filtered in the browser:
// a number computed in TypeScript is a defect (CLAUDE.md), so the slicer
// is a parameterised fetch, not a client-side filter. Only descriptive
// charts are sliceable; model-backed panels keep the full sample (a
// per-year effect estimate would be a new analysis) and wear a "full
// period" chip while a year is active, so no one mistakes them for
// filtered views.
//
// The panel toggles filter the VIEW only: which tiles are on screen.
// Series inside a panel can still be toggled with Plotly's own legend.

import { useEffect, useState } from "react";
import PlotlyChart from "@/components/PlotlyChart";
import { API_BASE } from "@/lib/api";

export interface Tile {
  id: string;
  group: string;
  /** Chart name on the API; the tile refetches it when the year changes. */
  chart: string;
  title: string;
  note?: string;
  /** Full-period figure, fetched server-side for first paint. */
  figure: unknown;
  /** Descriptive chart that accepts ?year= (charts.SLICEABLE). */
  sliceable?: boolean;
  /** Headline panels span both columns and get the taller box. */
  wide?: boolean;
}

function SlicedTile({ tile, year }: { tile: Tile; year: number | null }) {
  // The displayed figure is DERIVED: the server-fetched full-period figure
  // unless a year slice applies, in which case it comes from the slice
  // cache. State changes only happen in fetch callbacks, never
  // synchronously in the effect body.
  const [slices, setSlices] = useState<ReadonlyMap<string, unknown>>(
    new Map(),
  );
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  const key =
    tile.sliceable && year !== null ? `${tile.chart}:${year}` : null;
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
    fetch(`${API_BASE}/charts/${tile.chart}?compact=true&year=${year}`)
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
  }, [key, slices, failed, tile.chart, year]);

  return (
    <div className="border border-line bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-3.5 py-2.5">
        <h3 className="text-[13px] font-semibold">{tile.title}</h3>
        <span className="num text-[11.5px] text-muted">
          {year !== null &&
            (tile.sliceable ? (
              <span className="mr-2 border border-line px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.05em]">
                {year}
              </span>
            ) : (
              <span className="mr-2 border border-line px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.05em]">
                full period
              </span>
            ))}
          {tile.note}
        </span>
      </div>
      {state === "error" ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-muted">
          This year&rsquo;s figure did not load. Pick another year or All
          years.
        </p>
      ) : state === "loading" ? (
        <div
          className={`flex w-full items-center justify-center ${tile.wide ? "h-[320px]" : "h-[228px]"}`}
        >
          <span className="flex items-center gap-2.5 text-[12.5px] text-muted">
            <span className="size-3 animate-spin rounded-full border-2 border-line border-t-ink" />
            Recomputing {year} in Python
          </span>
        </div>
      ) : (
        <PlotlyChart figure={figure} compact={!tile.wide} tall={tile.wide} />
      )}
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
  const [year, setYear] = useState<number | null>(null);

  const visible = tiles.filter((t) => !hidden.includes(t.group));
  const toggle = (g: string) =>
    setHidden((h) => (h.includes(g) ? h.filter((x) => x !== g) : [...h, g]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-line bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">Year</span>
          {[null, ...years].map((y) => {
            const on = year === y;
            return (
              <button
                key={y ?? "all"}
                type="button"
                onClick={() => setYear(y)}
                aria-pressed={on}
                className={`border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                  on
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white text-muted hover:border-ink hover:text-ink"
                }`}
              >
                {y ?? "All years"}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-l border-line pl-4">
          <span className="eyebrow mr-1">Panels</span>
          {groups.map((g) => {
            const on = !hidden.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggle(g)}
                aria-pressed={on}
                className={`border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
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
        <span className="ml-auto text-[11.5px] text-muted">
          Year slicing recomputes the descriptive panels in Python; modelled
          panels always use the full sample and say so.
        </span>
      </div>

      {lead}

      {visible.length === 0 ? (
        <p className="border border-line bg-white px-4 py-8 text-center text-[13px] text-muted">
          Every panel is switched off. Turn one back on above.
        </p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {visible.map((t) => (
            <div key={t.id} className={t.wide ? "xl:col-span-2" : ""}>
              <SlicedTile tile={t} year={year} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
