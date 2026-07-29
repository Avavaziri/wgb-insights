import PlotlyChart from "@/components/PlotlyChart";
import { ApiDown } from "@/components/ApiGuard";
import { InSampleOnlyBadge } from "@/components/banners";
import { ApiDownError, getChart, getJson } from "@/lib/api";
import type { Decomposition } from "@/lib/types";

export default async function MarginPage() {
  let data: Decomposition;
  let repFig: unknown;
  try {
    [data, repFig] = await Promise.all([
      getJson<Decomposition>("/decomposition"),
      getChart("rep_confounding"),
    ]);
  } catch (e) {
    if (e instanceof ApiDownError) return <ApiDown message={e.message} />;
    throw e;
  }

  return (
    <>
      <h1 className="text-4xl font-black tracking-tight">Where margin lives</h1>
      <p className="max-w-3xl text-neutral-700">
        Nested decomposition of {data.target}. Each block enters cumulatively;
        the question is who moves <em>out-of-sample</em> R² — in-sample
        significance without predictive gain is flagged, not celebrated.
      </p>

      <div className="overflow-x-auto border border-neutral-300">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-black font-black uppercase">
              <th className="p-2">Block (cumulative)</th>
              <th className="p-2">R²</th>
              <th className="p-2">adj R²</th>
              <th className="p-2">CV R²</th>
              <th className="p-2">CV increment</th>
              <th className="p-2">params</th>
              <th className="p-2">nested F p</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr
                key={r.block}
                className={`border-b border-neutral-200 ${
                  r.block === "customer" ? "bg-[#FFE600]/40 font-bold" : ""
                }`}
              >
                <td className="p-2">
                  + {r.block}
                  {r.in_sample_only && <InSampleOnlyBadge />}
                </td>
                <td className="p-2">{r.r2.toFixed(3)}</td>
                <td className="p-2">{r.r2_adj.toFixed(3)}</td>
                <td className="p-2">{r.r2_cv.toFixed(3)}</td>
                <td className="p-2">{r.cv_increment >= 0 ? "+" : ""}{r.cv_increment.toFixed(3)}</td>
                <td className="p-2">{r.n_params}</td>
                <td className="p-2">
                  {r.f_p_vs_prev === null ? "—" : r.f_p_vs_prev.toExponential(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-neutral-500">{data.order_note}</p>

      <section className="space-y-3">
        <h2 className="text-2xl font-black">The rep dashboard this data refuses to build</h2>
        <PlotlyChart figure={repFig} />
        <p className="max-w-3xl text-sm text-neutral-700">
          Naive model ({data.rep_pair.naive.formula}): CV R²{" "}
          {data.rep_pair.naive.r2_cv.toFixed(3)} on {data.rep_pair.naive.n_obs}{" "}
          jobs. Controlled (rep added after size, run features, product,
          customer, year): F p = {data.rep_pair.controlled_f_p.toFixed(2)}, CV
          gain {data.rep_pair.controlled_cv_increment >= 0 ? "+" : ""}
          {data.rep_pair.controlled_cv_increment.toFixed(3)}.{" "}
          <span className="font-bold">{data.rep_pair.conclusion}</span>
        </p>
      </section>
    </>
  );
}
