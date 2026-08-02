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

// One tab, every surviving panel. Five charts plus the gauge made the
// cut; the decomposition table and the BH diagnostic live in the
// Overview's evidence fold instead, because a table and a methodology
// chart are not dashboard panels. The capacity_share tile was cut in a
// minimalism review: the gauge directly above it draws the same split
// at the same crossover with both rates, so the tile was the one panel
// telling a story the page had already told (the chart itself is still
// computed, tested and exported; only the tile is gone). Every panel
// left maps to one of the three acts. Each figure arrives from Python
// already laid out for its tile size (`compact`), so nothing here is a
// scaled-down poster.
const CHART_NAMES = [
  "trend_context",
  "rate_curve",
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
  const [fTrend, fRate, fOverride, fRep, fChurn] = figures;

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
      note:
        th.crossover_hrs === null
          ? "no crossover in this extract"
          : `crossover ${th.crossover_hrs.toFixed(1)}h`,
      sliceable: true,
      read: `Left to right is job size, and the line is what one hour of press time earns at that size. It falls the whole way, so there is no best size to aim for, only the point where it crosses the factory's own average (the dashed line). The yellow band is the uncertainty on that point. The same pattern shows up inside individual accounts: ${th.size_mix_statement}.`,
      changes:
        th.crossover_hrs === null
          ? `The rate curve stays on one side of the factory's own ${gbp(th.benchmark_rate_gbp_per_hr)}/hr average in this extract, so there is no size threshold to flag quotes at. Job-by-job pricing against that average still applies.`
          : `Quotes expected to run past ${th.crossover_hrs.toFixed(1)}h get checked against the ${gbp(th.benchmark_rate_gbp_per_hr)}/hr average before they go out. Treat that as a review trigger rather than a rule. Big runs carry the factory's fixed costs, and an hour at a lower rate still beats an idle hour, so the aim is to price large work knowingly wherever there is room to.`,
      figure: fRate,
      wide: true,
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
      changes: "Don't manage reps on raw margin. Each account has one rep, so this data cannot separate a rep's own selling from the accounts they hold; a league table built on it would mostly reward inheritance. The panel exists to prevent that call.",
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
            {/* "constraint analysis is Litho-only" stood here too. The
                gauge's own footer carries it a few hundred pixels below,
                where it sits with the figure it qualifies. */}
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
