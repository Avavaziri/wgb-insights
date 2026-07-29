import PlotlyChart from "@/components/PlotlyChart";
import { ApiDown } from "@/components/ApiGuard";
import { CautionBanner, StatTile } from "@/components/banners";
import { ApiDownError, getChart, getJson } from "@/lib/api";
import type { Pricing } from "@/lib/types";

export default async function PricingPage() {
  let data: Pricing;
  let scaleFig: unknown;
  try {
    [data, scaleFig] = await Promise.all([
      getJson<Pricing>("/pricing"),
      getChart("override_scale"),
    ]);
  } catch (e) {
    if (e instanceof ApiDownError) return <ApiDown message={e.message} />;
    throw e;
  }
  const s = data.scale;
  const m = data.model;
  const e = data.override_effect.effect;

  return (
    <>
      <h1 className="text-4xl font-black tracking-tight">Pricing &amp; overrides</h1>
      <p className="max-w-3xl text-neutral-700">
        <code>manadj</code> is a £ price override — provable because{" "}
        <code>mupnett = labmup + manadj</code> holds to 10⁻¹². If that identity
        ever breaks on a new file, this page refuses to render numbers rather
        than guess.
      </p>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Override rate"
          value={`${(s.override_rate * 100).toFixed(0)}%`}
          detail={`|manadj| > £${s.tolerance_gbp} · ${s.n_unknown_manadj} rows unknown (null), excluded`}
        />
        <StatTile label="Priced up" value={s.n_up.toLocaleString()} />
        <StatTile label="Priced down" value={s.n_down.toLocaleString()} />
        <StatTile
          label="Net human judgement"
          value={`${s.net_gbp_per_year >= 0 ? "+" : ""}£${Math.round(s.net_gbp_per_year / 1000)}k/yr`}
          detail={`gross £${Math.round(s.gross_gbp_per_year / 1000)}k/yr over ${s.span_years.toFixed(1)} years`}
        />
      </section>

      <PlotlyChart figure={scaleFig} />

      <section className="space-y-3">
        <h2 className="text-2xl font-black">Is the override learnable?</h2>
        <div className="overflow-x-auto border border-neutral-300">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-black font-black uppercase">
                <th className="p-2">Predictor ({m.model_family}, GroupKFold on customer, {m.cv_folds} folds)</th>
                <th className="p-2">Out-of-fold R²</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-200 font-bold">
                <td className="p-2">Model (quote-time features)</td>
                <td className="p-2">{m.r2_cv_model.toFixed(3)}</td>
              </tr>
              <tr className="border-b border-neutral-200">
                <td className="p-2">Baseline: predict zero</td>
                <td className="p-2">{m.r2_cv_baseline_zero.toFixed(3)}</td>
              </tr>
              <tr className="border-b border-neutral-200">
                <td className="p-2">Baseline: customer mean</td>
                <td className="p-2">{m.r2_cv_baseline_customer_mean.toFixed(3)}</td>
              </tr>
              <tr>
                <td className="p-2">Baseline: global mean</td>
                <td className="p-2">{m.r2_cv_baseline_global_mean.toFixed(3)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="max-w-3xl text-sm">
          Direction AUC {m.auc_direction.toFixed(2)} (0.5 = coin flip) on{" "}
          {m.n_obs.toLocaleString()} jobs, {m.n_clusters} customers.{" "}
          <span className="font-bold">{m.finding}</span>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-black">The override→margin question</h2>
        <CautionBanner text={data.override_effect.caution} />
        <p className="max-w-3xl text-sm text-neutral-700">
          Computed anyway (exclusion is a communication decision, recorded in the
          register): {e.pct_effect?.toFixed(1)}% [
          {((Math.exp(e.ci_low) - 1) * 100).toFixed(1)},{" "}
          {((Math.exp(e.ci_high) - 1) * 100).toFixed(1)}]%, raw p ={" "}
          {e.p_value.toFixed(3)}, BH-adjusted p = {e.p_value_adj?.toFixed(3)}, n ={" "}
          {e.n_obs.toLocaleString()}, {e.se_type}.
        </p>
      </section>
    </>
  );
}
