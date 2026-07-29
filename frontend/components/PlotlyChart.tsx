"use client";

// Renders a Plotly figure shipped as fig.to_json() from Python.
// No chart logic lives here — data and layout arrive fully formed.
// plotly.js-dist-min has no types/default component, so the factory
// pattern wires it into react-plotly.js inside the dynamic import.

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
      <div className="flex h-96 items-center justify-center text-neutral-400">
        Loading chart…
      </div>
    ),
  },
);

interface FigureJson {
  data: Data[];
  layout: Partial<Layout>;
}

export default function PlotlyChart({ figure }: { figure: unknown }) {
  const fig = figure as FigureJson;
  return (
    <Plot
      data={fig.data}
      layout={{ ...fig.layout, autosize: true }}
      useResizeHandler
      className="w-full"
      style={{ width: "100%", height: "480px" }}
      config={{ displaylogo: false, responsive: true }}
    />
  );
}
