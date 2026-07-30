"use client";

// The dashboard surface: every panel on one page, with a slicer bar that
// filters which panels are shown.
//
// IMPORTANT — what this filter does and does not do. It filters the *view*:
// which panels are on screen. It does not filter the data, because every
// figure was computed in Python and shipped whole, and recomputing an
// aggregate here would put a second source of truth in the browser. Real
// data slicers (by year, work type, currency) need those slices precomputed
// in the pipeline and served as alternative figures — see the note in the
// dashboard page.
//
// Series inside a panel can still be toggled: Plotly's own legend does that
// without recomputing anything.

import { useState } from "react";
import PlotlyChart from "@/components/PlotlyChart";

export interface Tile {
  id: string;
  group: string;
  title: string;
  note?: string;
  figure: unknown;
  /** Panels worth twice the width — a wide time series, a long bar list. */
  wide?: boolean;
}

export default function DashboardGrid({ tiles }: { tiles: Tile[] }) {
  const groups = [...new Set(tiles.map((t) => t.group))];
  const [hidden, setHidden] = useState<string[]>([]);

  const visible = tiles.filter((t) => !hidden.includes(t.group));
  const toggle = (g: string) =>
    setHidden((h) => (h.includes(g) ? h.filter((x) => x !== g) : [...h, g]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border border-line bg-white px-3 py-2.5">
        <span className="eyebrow mr-1 text-[10px]">Panels</span>
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
                  ? "border-ink bg-yellow text-ink"
                  : "border-line bg-white text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {g}
            </button>
          );
        })}
        <span className="ml-auto text-[11.5px] text-muted">
          {visible.length} of {tiles.length} panels · click a legend entry in
          any panel to drop a series
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="border border-line bg-white px-4 py-6 text-center text-[13px] text-muted">
          Every panel is hidden. Switch one back on above.
        </p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {visible.map((t) => (
            <div
              key={t.id}
              className={`border border-line bg-white ${t.wide ? "xl:col-span-2" : ""}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-3 py-2">
                <h3 className="text-[13.5px]">{t.title}</h3>
                {t.note && (
                  <span className="num text-[11.5px] text-muted">{t.note}</span>
                )}
              </div>
              <PlotlyChart figure={t.figure} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
