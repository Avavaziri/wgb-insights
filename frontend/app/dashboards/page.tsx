import { ApiDown } from "@/components/ApiGuard";
import ConstraintGauge from "@/components/ConstraintGauge";
import DashboardGrid, { type Tile } from "@/components/DashboardGrid";
import { PageHeader } from "@/components/ui";
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
      read: `Each bar is one full year's revenue in this sample; the label on the bar carries that year's margin. The grey bar is the part year to ${data.as_of}, greyed rather than hidden — it is not a decline. The growth rate is an average: read the bars, years can be uneven.`,
      changes: `Nothing: growth is healthy, so the margin conversation moves to mix. This sample is ~${pct(data.sample_share_of_turnover, 0)} of stated turnover and nothing here extrapolates beyond it.`,
      figure: fTrend,
      wide: true,
    },
    {
      id: "rate",
      group: "Capacity",
      chart: "rate_curve",
      title: "Bigger jobs earn less per press-hour",
      note: `crossover ${th.crossover_hrs.toFixed(1)}h`,
      read: `Left to right is job size; the line is what one hour of press time earns at that size. It only falls — there is no best size to aim for, only the point where it crosses the factory's own average (the dashed line). The yellow band is the uncertainty on that point. And it is not just customer mix: with the account held fixed, the rate still moves ~${th.within_customer_pct_per_doubling.toFixed(0)}% for each doubling of size.`,
      changes: `Quotes expected to run past ${th.crossover_hrs.toFixed(1)}h get checked against the ${gbp(th.benchmark_rate_gbp_per_hr)}/hr average before they go out — a review trigger, not a rule to refuse big work.`,
      figure: fRate,
      wide: true,
    },
    {
      id: "capacity",
      group: "Capacity",
      chart: "capacity_share",
      title: "Press hours either side of the crossover",
      note: `benchmark ${gbp(th.benchmark_rate_gbp_per_hr)}/hr`,
      read: "All litho press hours, split at the crossover size; each bar says what those hours earned per hour. Press time is the resource that can't be bought quickly, so hours — not revenue — are the honest denominator.",
      changes: "Where re-pricing attention pays: the big-job share of hours. No '£ at stake' is claimed, because without capacity data a displaced-work figure would be invented.",
      figure: fCapacity,
      sliceable: true,
    },
    {
      id: "override",
      group: "Pricing",
      chart: "override_scale",
      title: "Manual price overrides, up against down",
      note: `${pct(pricing.scale.override_rate, 0)} of litho jobs`,
      read: "Counts of litho jobs the estimators re-priced upward and downward from the system price; the headline carries the net effect per year.",
      changes: "Keep the humans — pricing is actively governed, mostly upward, and the model evidence says it can't be automated from this extract. The practical step: start logging the reason for each override, so the knowledge can be captured.",
      figure: fOverride,
      sliceable: true,
    },
    {
      id: "rep",
      group: "Margin mix",
      chart: "rep_confounding",
      title: "Rep effect before and after controls",
      note: `rep adds ${rep ? (rep.cv_increment >= 0 ? "+" : "") + rep.cv_increment.toFixed(3) : dash} predictive power`,
      read: "The left bar is what a naive rep league table would show; the right bar is what rep still explains once job size, product and customer are accounted for — nothing.",
      changes: "Don't manage reps on raw margin: the apparent differences are inherited accounts, not salesmanship. This panel exists to stop a bad decision, not to prompt one.",
      figure: fRep,
    },
    {
      id: "churn",
      group: "Retention",
      chart: "churn_comparison",
      title: "Own cadence against a flat 90-day rule",
      note: `${churn.comparison.n_personalised} vs ${churn.comparison.n_fixed} accounts`,
      read: "At-risk accounts flagged by a company-wide 90-day rule versus each account's own ordering rhythm. The bars disagree on WHICH accounts, not just how many — steady accounts gone quiet are caught months earlier.",
      changes: "The ranked call list on Customers & actions is built from the own-cadence rule, most valuable accounts first.",
      figure: fChurn,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Dashboards"
        title="Every panel, one page"
        meta={
          <>
            <span>{num(Number(data.validation.n_rows))} jobs</span>
            <span aria-hidden className="text-line">
              /
            </span>
            <span>
              to <span className="num">{data.as_of}</span>
            </span>
            <span aria-hidden className="text-line">
              /
            </span>
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
            lithoNote={th.litho_only_note}
          />
        }
      />
    </>
  );
}
