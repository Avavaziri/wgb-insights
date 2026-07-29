import PlotlyChart from "@/components/PlotlyChart";
import { ApiDown } from "@/components/ApiGuard";
import { StatTile } from "@/components/banners";
import { API_BASE, ApiDownError, getChart, getJson } from "@/lib/api";
import type { Churn } from "@/lib/types";

const BAND_STYLE: Record<string, string> = {
  high: "bg-black text-[#FFE600]",
  elevated: "bg-[#FFE600]",
  "watch (irregular)": "bg-neutral-200",
  normal: "",
};

export default async function RetentionPage() {
  let data: Churn;
  let cmpFig: unknown;
  try {
    [data, cmpFig] = await Promise.all([
      getJson<Churn>("/churn"),
      getChart("churn_comparison"),
    ]);
  } catch (e) {
    if (e instanceof ApiDownError) return <ApiDown message={e.message} />;
    throw e;
  }
  const nForecastable = data.rows.filter((r) => r.forecastable).length;
  const flagged = data.rows.filter((r) => r.at_risk_personalised).length;

  return (
    <>
      <h1 className="text-4xl font-black tracking-tight">Retention risk</h1>
      <p className="max-w-3xl text-neutral-700">{data.gate}</p>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Accounts"
          value={`${data.rows.length}`}
          detail={`as of ${data.as_of} — from the data, not the clock`}
        />
        <StatTile
          label="Forecastable"
          value={`${nForecastable}`}
          detail="regular enough for a predicted next order"
        />
        <StatTile
          label="Personalised at-risk"
          value={`${flagged}`}
          detail="silent beyond own median × (1 + 1.5 × own CV)"
        />
        <StatTile
          label="Fixed 90-day rule"
          value={`${data.comparison.n_fixed}`}
          detail={`different set: misses ${data.comparison.only_personalised.length} the personalised rule catches`}
        />
      </section>

      <PlotlyChart figure={cmpFig} />

      <a
        href={`${API_BASE}/call-list.csv`}
        className="inline-block border-2 border-black bg-[#FFE600] px-4 py-2 font-bold hover:bg-black hover:text-[#FFE600]"
        download="call_list.csv"
      >
        Download ranked call list (CSV)
      </a>

      <div className="overflow-x-auto border border-neutral-300">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-black font-black uppercase">
              <th className="p-2">Customer</th>
              <th className="p-2">Orders</th>
              <th className="p-2">Median interval</th>
              <th className="p-2">Interval CV</th>
              <th className="p-2">Days silent</th>
              <th className="p-2">Risk</th>
              <th className="p-2">Reason</th>
              <th className="p-2">Expected next order</th>
            </tr>
          </thead>
          <tbody>
            {data.rows
              .slice()
              .sort((a, b) => (b.gap_ratio ?? 0) - (a.gap_ratio ?? 0))
              .map((r) => (
                <tr key={r.customer} className="border-b border-neutral-200">
                  <td className="p-2 font-medium">{r.customer}</td>
                  <td className="p-2">{r.n_orders}</td>
                  <td className="p-2">
                    {r.median_interval === null ? "—" : `${r.median_interval.toFixed(0)}d`}
                  </td>
                  <td className="p-2">
                    {r.interval_cv === null ? "—" : r.interval_cv.toFixed(2)}
                  </td>
                  <td className="p-2">{r.gap_days.toFixed(0)}</td>
                  <td className="p-2">
                    <span
                      className={`px-1.5 py-0.5 text-xs font-black uppercase ${BAND_STYLE[r.risk_band] ?? ""}`}
                    >
                      {r.risk_band}
                    </span>
                  </td>
                  <td className="p-2 text-neutral-600">{r.reason_code}</td>
                  <td className="p-2">
                    {r.expected_next_order ?? (
                      <span className="text-neutral-400">
                        not forecastable — no date invented
                      </span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
