import PlotlyChart from "@/components/PlotlyChart";
import UploadZone from "@/components/UploadZone";
import { ApiDown } from "@/components/ApiGuard";
import { StatTile } from "@/components/banners";
import { API_BASE, ApiDownError, getChart, getJson } from "@/lib/api";
import type { Overview } from "@/lib/types";

export default async function OverviewPage() {
  let data: Overview;
  let trendFig: unknown;
  try {
    [data, trendFig] = await Promise.all([
      getJson<Overview>("/overview"),
      getChart("trend_context"),
    ]);
  } catch (e) {
    if (e instanceof ApiDownError) return <ApiDown message={e.message} />;
    throw e;
  }
  const v = data.validation;
  const c = data.clean_report;

  return (
    <>
      <section className="space-y-3">
        <h1 className="text-4xl font-black tracking-tight">
          Print-job analytics.{" "}
          <span className="bg-[#FFE600] px-2">Judged, not just charted.</span>
        </h1>
        <p className="max-w-3xl text-neutral-700">
          {data.source_name} · data to {data.as_of} (derived from the data, never
          the clock) · seeds {JSON.stringify(data.seeds)} — every number
          reproduces. {data.scale_caveat}
        </p>
      </section>

      <UploadZone />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Revenue CAGR 23→25"
          value={`${(data.growth.revenue_cagr * 100).toFixed(1)}%`}
          detail={`value/job ${(data.growth.revenue_per_job_cagr * 100).toFixed(1)}% · jobs ${(data.growth.jobs_cagr * 100).toFixed(1)}%`}
        />
        <StatTile
          label="Rows / customers / reps"
          value={`${v.n_rows}`}
          detail={`${v.n_customers} customers · ${v.n_reps} reps`}
        />
        <StatTile
          label="Quarantined credits"
          value={`${c.n_quarantined_credits}`}
          detail="Sell Price ≤ 0 — separated, counted, never dropped silently"
        />
        <StatTile
          label="Sample share of turnover"
          value={`${(data.sample_share_of_turnover * 100).toFixed(0)}%`}
          detail="computed from config — no extrapolation anywhere"
        />
      </section>

      <section>
        <PlotlyChart figure={trendFig} />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="border border-neutral-300 p-4">
          <h2 className="font-black uppercase tracking-wide">Validation report</h2>
          <ul className="mt-2 space-y-1 text-sm text-neutral-700">
            <li>
              Identity VA/24 = VA/(hrs)·24 max err:{" "}
              {Number(v.identity1_max_err).toExponential(1)}
            </li>
            <li>
              Identity mupnett = labmup + manadj max err:{" "}
              {Number(v.identity2_max_err).toExponential(1)} on{" "}
              {v.n_identity2_checked} complete rows
              {v.identity2_ok ? "" : " — BROKEN: pricing module refuses to report"}
            </li>
            <li>
              #DIV/0! error cells in VA% (counted via openpyxl): {v.va_pct_error_cells}
            </li>
            <li>Null manadj (excluded from override analysis): {v.n_null_manadj}</li>
            <li>
              Null Binding Type (recoded to outsourced — data, not absence):{" "}
              {v.n_null_binding}
            </li>
            <li>
              Press hrs = 0 (constraint analysis is Litho-only): {v.n_press_hrs_zero}
            </li>
          </ul>
        </div>
        <div className="border border-neutral-300 p-4">
          <h2 className="font-black uppercase tracking-wide">
            Data gaps — the investment ask
          </h2>
          <ul className="mt-2 space-y-2 text-sm text-neutral-700">
            {data.gaps.map((g) => (
              <li key={g.gap}>
                <span className="font-bold">{g.gap}.</span> Blocks: {g.blocks}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <details className="border border-neutral-300">
        <summary className="cursor-pointer bg-neutral-100 p-3 font-bold">
          Hypothesis register — {data.hypothesis_register.length} hypotheses,
          including the rejected ones
        </summary>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-black font-black uppercase">
                <th className="py-2 pr-4">Hypothesis</th>
                <th className="py-2 pr-4">Outcome</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {data.hypothesis_register.map((e) => (
                <tr key={e.id} className="border-b border-neutral-200 align-top">
                  <td className="py-2 pr-4 font-medium">{e.hypothesis}</td>
                  <td className="py-2 pr-4">{e.outcome}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`px-1.5 py-0.5 text-xs font-black uppercase ${
                        e.status === "headline" ? "bg-[#FFE600]" : "bg-neutral-200"
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="py-2 text-neutral-600">{e.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-sm text-neutral-500">
        Typed API with every schema at{" "}
        <a className="underline" href={`${API_BASE}/docs`}>
          {API_BASE}/docs
        </a>{" "}
        — no bare R², no bare p-value can cross it.
      </p>
    </>
  );
}
