import { ApiDown } from "@/components/ApiGuard";
import ConstraintGauge from "@/components/ConstraintGauge";
import DashboardGrid, { type Tile } from "@/components/DashboardGrid";
import { MetaSep, PageHeader } from "@/components/ui";
import { dash, gbp, num, pct } from "@/lib/format";
import { ApiDownError, getChart, getJson } from "@/lib/api";
import type {
  Churn,
  Decomposition,
  Overview,
  Pricing,
  Thresholds,
} from "@/lib/types";

// One tab, every surviving panel. Six charts made the cut; the
// decomposition table and the BH diagnostic live in the Overview's
// evidence fold instead, because a table and a methodology chart are not
// dashboard panels. Each figure arrives from Python already laid out for
// its tile size (`compact`), so nothing here is a scaled-down poster.
const CHART_NAMES = [
  "trend_context",
  "rate_curve",
  "capacity_share",
  "override_scale",
  "rep_confounding",
  "churn_comparison",
] as const;

export default async function DashboardsPage() {
  let data: Overview;
  let th: Thresholds;
  let dec: Decomposition;
  let pricing: Pricing;
  let churn: Churn;
  let figures: unknown[];
  try {
    const [core, figs] = await Promise.all([
      Promise.all([
        getJson<Overview>("/overview"),
        getJson<Thresholds>("/thresholds"),
        getJson<Decomposition>("/decomposition"),
        getJson<Pricing>("/pricing"),
        getJson<Churn>("/churn"),
      ]),
      Promise.all(CHART_NAMES.map((n) => getChart(n, { compact: true }))),
    ]);
    [data, th, dec, pricing, churn] = core;
    figures = figs;
  } catch (e) {
    if (e instanceof ApiDownError) return <ApiDown message={e.message} />;
    throw e;
  }

  const cap = th.capacity_share;
  const rep = dec.rows.find((r) => r.block === "rep");
  const [fTrend, fRate, fCapacity, fOverride, fRep, fChurn] = figures;

  // Years offered by the slicer: every year present in the trend plus the
  // partial one; the API decides what each chart does with them.
  const years = [
    ...data.trend.map((t) => t.year),
    ...(data.partial_year ? [data.partial_year] : []),
  ];

  // Panel notes restate figures the API computed, never a value derived
  // here; the read/changes lines are prose interpretation with API values
  // interpolated, which is the sanctioned pattern (words here, numbers
  // from Python). Tiles run in story order: context, then the three acts.
  const tiles: Tile[] = [
    {
      id: "trend",
      group: "Trend",
      chart: "trend_context",
      title: "Revenue and margin by year",
      note: `CAGR ${pct(data.growth.revenue_cagr)}`,
      read: `Each bar is one full year's revenue in this sample, and the label on it carries that year's margin. The grey bar is the part year to ${data.as_of}. It stays visible and greyed, so nobody mistakes it for a decline. The growth rate is an average, so read the bars themselves: the years are uneven.`,
      changes: `Nothing here. Growth is healthy, which moves the margin conversation on to mix. This sample is ~${pct(data.sample_share_of_turnover, 0)} of stated turnover and nothing here extrapolates beyond it.`,
      figure: fTrend,
      wide: true,
      noSlice:
        "No year filter here: this panel is the year-by-year view, so every year is already on it.",
    },
    {
      id: "rate",
      group: "Capacity",
      chart: "rate_curve",
      title: "Bigger jobs earn less per press-hour",
      note: `crossover ${th.crossover_hrs.toFixed(1)}h`,
      sliceable: true,
      read: `Left to right is job size, and the line is what one hour of press time earns at that size. It falls the whole way, so there is no best size to aim for, only the point where it crosses the factory's own average (the dashed line). The yellow band is the uncertainty on that point. The same pattern shows up inside individual accounts: ${th.size_mix_statement}.`,
      changes: `Quotes expected to run past ${th.crossover_hrs.toFixed(1)}h get checked against the ${gbp(th.benchmark_rate_gbp_per_hr)}/hr average before they go out. Treat that as a review trigger rather than a rule. Big runs carry the factory's fixed costs, and an hour at a lower rate still beats an idle hour, so the aim is to price large work knowingly wherever there is room to.`,
      figure: fRate,
      wide: true,
    },
    {
      id: "capacity",
      group: "Capacity",
      chart: "capacity_share",
      title: "Press hours either side of the crossover",
      note: `benchmark ${gbp(th.benchmark_rate_gbp_per_hr)}/hr`,
      read: "All litho press hours, split at the crossover size, with each bar showing what those hours earned. Press time is the resource that cannot be bought quickly, which is why hours are the denominator here instead of revenue.",
      changes: "Re-pricing attention pays off on the big-job share of hours. No '£ at stake' figure is claimed, because without capacity data a displaced-work number would be invented.",
      figure: fCapacity,
      sliceable: true,
    },
    {
      id: "override",
      group: "Pricing",
      chart: "override_scale",
      title: "How often estimators re-price by hand",
      note: `${pct(pricing.scale.override_rate, 0)} of litho jobs`,
      read: "Counts of litho jobs the estimators re-priced up and down from the system price. The headline carries the net effect per year, to the nearest £1k. 'Per year' divides the observed span's total by its length, so it assumes the mix continues.",
      changes: "Keep the humans. Pricing is actively governed, mostly upward, and the model evidence says it cannot be automated from this extract. The practical step is to start logging the reason for each override so the knowledge gets captured.",
      figure: fOverride,
      sliceable: true,
    },
    {
      id: "rep",
      group: "Margin mix",
      chart: "rep_confounding",
      title: "Rep effect before and after controls",
      note: `rep adds ${rep ? (rep.cv_increment >= 0 ? "+" : "") + rep.cv_increment.toFixed(3) : dash} predictive power`,
      read: "The left bar is what a naive rep league table would show. The right bar is what rep still explains once job size, product and customer are accounted for, which is nothing at all.",
      changes: "Don't manage reps on raw margin. The gaps come from the accounts they inherited rather than from how they sell, so the point of this panel is to prevent a bad call.",
      figure: fRep,
    },
    {
      id: "churn",
      group: "Retention",
      chart: "churn_comparison",
      title: "Own cadence against a flat 90-day rule",
      note: `${churn.comparison.n_personalised} vs ${churn.comparison.n_fixed} accounts`,
      read: `At-risk accounts flagged by a company-wide 90-day rule against each account's own ordering rhythm. The two disagree on which accounts, not only on how many. Backtested with the final year held out: the own-cadence rule caught ${churn.backtest.personalised.n_caught} of the ${churn.backtest.n_went_quiet} accounts that truly went quiet, flagging ${churn.backtest.personalised.n_flagged}; the 90-day rule caught ${churn.backtest.fixed.n_caught}, flagging ${churn.backtest.fixed.n_flagged}. Catching all of them costs a few extra calls. With ${churn.backtest.n_went_quiet} outcomes across ${churn.backtest.n_accounts} accounts, treat this as evidence and not as proof.`,
      changes: "The ranked call list on Customers & actions is built from the own-cadence rule, most valuable accounts first.",
      figure: fChurn,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Dashboards"
        title="Six panels, each with its own year filter"
        meta={
          <>
            <span>{num(Number(data.validation.n_rows))} jobs</span>
            <MetaSep />
            <span>
              to <span className="num">{data.as_of}</span>
            </span>
            <MetaSep />
            <span>constraint analysis is Litho-only</span>
          </>
        }
      />

      <DashboardGrid
        tiles={tiles}
        years={years}
        lead={
          <ConstraintGauge
            share={cap.share_of_constraint_hours}
            crossoverHrs={th.crossover_hrs}
            benchmark={th.benchmark_rate_gbp_per_hr}
            rateAbove={cap.pooled_rate_above}
            shareRange={th.share_range_across_crossover_ci}
            lithoNote={th.litho_only_note}
          />
        }
      />
    </>
  );
}
