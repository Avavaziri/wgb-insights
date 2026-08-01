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

  // Panel notes restate figures the API computed, never a value derived here.
  const tiles: Tile[] = [
    {
      id: "trend",
      group: "Trend",
      chart: "trend_context",
      title: "Revenue and margin by year",
      note: `CAGR ${pct(data.growth.revenue_cagr)}`,
      figure: fTrend,
      wide: true,
    },
    {
      id: "rate",
      group: "Capacity",
      chart: "rate_curve",
      title: "Bigger jobs earn less per press-hour",
      note: `crossover ${th.crossover_hrs.toFixed(1)}h`,
      figure: fRate,
      wide: true,
    },
    {
      id: "capacity",
      group: "Capacity",
      chart: "capacity_share",
      title: "Press hours either side of the crossover",
      note: `benchmark ${gbp(th.benchmark_rate_gbp_per_hr)}/hr`,
      figure: fCapacity,
      sliceable: true,
    },
    {
      id: "override",
      group: "Pricing",
      chart: "override_scale",
      title: "Manual price overrides, up against down",
      note: `${pct(pricing.scale.override_rate, 0)} of jobs`,
      figure: fOverride,
      sliceable: true,
    },
    {
      id: "rep",
      group: "Margin mix",
      chart: "rep_confounding",
      title: "Rep effect before and after controls",
      note: `rep ${rep ? (rep.cv_increment >= 0 ? "+" : "") + rep.cv_increment.toFixed(3) : dash} CV R²`,
      figure: fRep,
    },
    {
      id: "churn",
      group: "Retention",
      chart: "churn_comparison",
      title: "Own cadence against a flat 90-day rule",
      note: `${churn.comparison.n_personalised} vs ${churn.comparison.n_fixed} accounts`,
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
