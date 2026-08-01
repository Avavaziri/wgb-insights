"use client";

// Renders a Plotly figure shipped as fig.to_json() from Python. No chart
// logic lives here: traces, axes, annotations and titles arrive fully
// formed and are passed through untouched, so the web view and the
// exported slide PNG are the same figure.
//
// The only overrides are presentational and non-numeric: a transparent
// paper so the card supplies the surface, and a 16:9 box so the
// export-tuned type sizes (base 16 / title 24 at 1920x1080) stay in
// proportion instead of being squashed into a short container.

import dynamic from "next/dynamic";
import type { Layout, Data } from "plotly.js";

const Plot = dynamic(
  async () => {
    const [{ default: createPlotlyComponent }, plotly] = await Promise.all([
      import("react-plotly.js/factory"),
      import("plotly.js-dist-min"),
    ]);
    return createPlotlyComponent(plotly);
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[228px] items-center justify-center">
        <span className="flex items-center gap-2.5 text-caption text-muted">
          <span className="size-3 animate-spin rounded-full border-2 border-line border-t-ink" />
          Rendering
        </span>
      </div>
    ),
  },
);

interface FigureJson {
  data: Data[];
  layout: Partial<Layout>;
}

export default function PlotlyChart({
  figure,
  caption,
  compact = false,
  tall = false,
  title,
}: {
  figure: unknown;
  /** Reading note beneath the figure, never a restated number. */
  caption?: string;
  /**
   * Dashboard-tile rendering. Pair with `getChart(name, { compact: true })`:
   * the small-format geometry comes from Python, this only sizes the box.
   * A fixed short height, no frame: the tile supplies the frame and header.
   */
  compact?: boolean;
  /**
   * The headline-tile size: same stripped-chrome figure as compact, in a
   * taller box so its labels stay legible in a 1080p screen recording.
   */
  tall?: boolean;
  /**
   * Accessible name for the figure (role="img" + aria-label). Plotly's own
   * SVG has no text a screen reader can use, so this is required reading
   * for anyone not looking at the chart - always compose it from copy
   * that already exists on the page (a panel title, a "how to read it"
   * line), never write new prose here.
   */
  title?: string;
}) {
  const fig = figure as FigureJson;

  if (compact || tall) {
    return (
      <div
        role={title ? "img" : undefined}
        aria-label={title}
        className={`w-full ${tall ? "h-[320px]" : "h-[228px]"}`}
      >
        <Plot
          data={fig.data}
          layout={{
            ...fig.layout,
            autosize: true,
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
          }}
          useResizeHandler
          style={{ width: "100%", height: "100%" }}
          config={{
            displaylogo: false,
            responsive: true,
            displayModeBar: false,
            staticPlot: false,
          }}
        />
      </div>
    );
  }

  return (
    <figure className="space-y-2">
      <div className="border border-line bg-white">
        {/* 16:9 keeps the export-tuned type in proportion, capped so a wide
            monitor does not turn one figure into a full screen of chart. */}
        <div
          role={title ? "img" : undefined}
          aria-label={title}
          className="aspect-[16/9] max-h-[460px] min-h-[340px] w-full"
        >
          <Plot
            data={fig.data}
            layout={{
              ...fig.layout,
              autosize: true,
              paper_bgcolor: "rgba(0,0,0,0)",
              plot_bgcolor: "rgba(0,0,0,0)",
            }}
            useResizeHandler
            style={{ width: "100%", height: "100%" }}
            config={{
              displaylogo: false,
              responsive: true,
              displayModeBar: "hover",
              modeBarButtonsToRemove: [
                "lasso2d",
                "select2d",
                "autoScale2d",
                "toggleSpikelines",
              ],
              toImageButtonOptions: { format: "png", scale: 2 },
            }}
          />
        </div>
      </div>
      {caption && (
        <figcaption className="measure text-body leading-relaxed text-muted">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
