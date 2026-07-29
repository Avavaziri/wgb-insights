import PlotlyChart from "@/components/PlotlyChart";
import { ApiDown } from "@/components/ApiGuard";
import { Inconclusive, NotHeadlineBanner, StatTile } from "@/components/banners";
import { ApiDownError, getChart, getJson } from "@/lib/api";
import type { Rush, Thresholds } from "@/lib/types";

export default async function ConstraintPage() {
  let th: Thresholds;
  let rush: Rush;
  let curveFig: unknown;
  let capacityFig: unknown;
  let bhFig: unknown;
  try {
    [th, rush, curveFig, capacityFig, bhFig] = await Promise.all([
      getJson<Thresholds>("/thresholds"),
      getJson<Rush>("/rush"),
      getChart("rate_curve"),
      getChart("capacity_share"),
      getChart("bh_family"),
    ]);
  } catch (e) {
    if (e instanceof ApiDownError) return <ApiDown message={e.message} />;
    throw e;
  }
  const mono = th.monotonicity;
  const me = rush.main_effect;

  return (
    <>
      <h1 className="text-4xl font-black tracking-tight">
        Job size &amp; the constraint
      </h1>
      <p className="max-w-3xl text-neutral-700">
        Press hours are the capacity-constrained resource; the margin metric is
        contribution per constraint-hour (throughput accounting).{" "}
        {th.litho_only_note}
      </p>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Monotonicity verdict"
          value={mono.interior_optimum ? "Interior optimum" : "Monotonic decline"}
          detail={`Spearman ρ ${Number(mono.spearman_rho).toFixed(2)}, n ${mono.n} — checked BEFORE any banding`}
        />
        <StatTile
          label="Factory average"
          value={`£${Math.round(th.benchmark_rate_gbp_per_hr)}/hr`}
          detail="hour-weighted — the internal benchmark"
        />
        <StatTile
          label="Crossover threshold"
          value={`${th.crossover_hrs.toFixed(1)}h`}
          detail={`windows ${th.crossover_window_range[0].toFixed(1)}–${th.crossover_window_range[1].toFixed(1)}h · 95% CI ${th.crossover_ci95[0].toFixed(1)}–${th.crossover_ci95[1].toFixed(1)}h`}
        />
        <StatTile
          label="Above the crossover"
          value={`${Math.round(th.capacity_share.share_of_constraint_hours * 100)}% of hours`}
          detail={`at £${Math.round(th.capacity_share.pooled_rate_above)}/hr`}
        />
      </section>

      <PlotlyChart figure={curveFig} />
      <PlotlyChart figure={capacityFig} />
      <p className="max-w-3xl text-sm text-neutral-600">{th.capacity_statement}</p>

      <section className="space-y-3">
        <h2 className="text-2xl font-black">Short-notice (rush) jobs</h2>
        {rush.bh_status === "not_headline" && (
          <NotHeadlineBanner text={rush.bh_note} />
        )}
        <p className="max-w-3xl text-sm text-neutral-700">
          Rush = bottom-percentile dwell within size band (a proxy — no
          scheduling data exists). Effect on contribution per constraint-hour
          with full controls: {me.pct_effect?.toFixed(1)}% [
          {((Math.exp(me.ci_low) - 1) * 100).toFixed(1)},{" "}
          {((Math.exp(me.ci_high) - 1) * 100).toFixed(1)}]%, raw p ={" "}
          {me.p_value.toFixed(3)}, BH-adjusted p = {me.p_value_adj?.toFixed(3)},
          n = {me.n_obs.toLocaleString()}, {me.se_type}.
        </p>
        <div className="overflow-x-auto border border-neutral-300">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-black font-black uppercase">
                <th className="p-2">Flag percentile</th>
                <th className="p-2">Effect</th>
                <th className="p-2">raw p</th>
                <th className="p-2">n flagged</th>
              </tr>
            </thead>
            <tbody>
              {rush.percentile_sensitivity.map((r) => (
                <tr key={r.percentile} className="border-b border-neutral-200">
                  <td className="p-2">{(r.percentile * 100).toFixed(0)}%</td>
                  <td className="p-2">{r.pct_effect.toFixed(1)}%</td>
                  <td className="p-2">{r.p_value.toFixed(3)}</td>
                  <td className="p-2">{r.n_rush}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Inconclusive
          title="Does the rush penalty depend on how busy the factory is?"
          note={rush.interaction.inconclusive}
        >
          <p className="text-sm">
            Interaction term: coef {rush.interaction.interaction.coef.toFixed(3)},
            p = {rush.interaction.interaction.p_value.toFixed(2)}, n ={" "}
            {rush.interaction.interaction.n_obs.toLocaleString()}. Simple slopes
            by relative load bin:{" "}
            {rush.interaction.simple_slopes
              .map(
                (s) =>
                  `bin ${s.load_bin}: ${Number(s.pct_effect).toFixed(1)}% (p ${Number(s.p_value).toFixed(2)})`,
              )
              .join(" · ")}
          </p>
        </Inconclusive>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-black">
          The correction that demoted our own finding
        </h2>
        <PlotlyChart figure={bhFig} />
      </section>
    </>
  );
}
