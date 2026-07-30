import { ApiDown } from "@/components/ApiGuard";
import DashboardGrid, { type Tile } from "@/components/DashboardGrid";
import HeroBand from "@/components/HeroBand";
import UploadZone from "@/components/UploadZone";
import { Chip, Kpi, KpiRow, MetaSep, Section, Signpost } from "@/components/ui";
import { gbp, num, pct, pctPoints, pval } from "@/lib/format";
import { ApiDownError, getChart, getJson } from "@/lib/api";
import type {
  Churn,
  Decomposition,
  Overview,
  Pricing,
  Rush,
  Thresholds,
} from "@/lib/types";

// Every panel in the app on one page, at tile size. The figures arrive from
// Python already laid out for a small tile (`compact`), so nothing here is a
// scaled-down poster.
const CHARTS = [
  "trend_context",
  "rate_curve",
  "capacity_share",
  "override_scale",
  "decomposition_table",
  "rep_confounding",
  "churn_comparison",
  "bh_family",
] as const;

export default async function OverviewPage() {
  let data: Overview;
  let th: Thresholds;
  let dec: Decomposition;
  let pricing: Pricing;
  let rush: Rush;
  let churn: Churn;
  let figures: unknown[];
  try {
    const [core, figs] = await Promise.all([
      Promise.all([
        getJson<Overview>("/overview"),
        getJson<Thresholds>("/thresholds"),
        getJson<Decomposition>("/decomposition"),
        getJson<Pricing>("/pricing"),
        getJson<Rush>("/rush"),
        getJson<Churn>("/churn"),
      ]),
      Promise.all(CHARTS.map((n) => getChart(n, { compact: true }))),
    ]);
    [data, th, dec, pricing, rush, churn] = core;
    figures = figs;
  } catch (e) {
    if (e instanceof ApiDownError) return <ApiDown message={e.message} />;
    throw e;
  }

  const v = data.validation;
  const cust = dec.rows.find((r) => r.block === "customer");
  const rep = dec.rows.find((r) => r.block === "rep");
  const capacityShare = Math.round(
    th.capacity_share.share_of_constraint_hours * 100,
  );
  const [fTrend, fRate, fCapacity, fOverride, fDecomp, fRep, fChurn, fBh] =
    figures;

  // Panel notes restate figures the API computed — never a value derived here.
  const tiles: Tile[] = [
    {
      id: "trend",
      group: "Trend",
      title: "Revenue and margin by year",
      note: `CAGR ${pct(data.growth.revenue_cagr)}`,
      figure: fTrend,
      wide: true,
    },
    {
      id: "rate",
      group: "Capacity",
      title: "Contribution per press-hour by job size",
      note: `crossover ${th.crossover_hrs.toFixed(1)}h`,
      figure: fRate,
    },
    {
      id: "capacity",
      group: "Capacity",
      title: "Press-hours above and below the benchmark",
      note: `benchmark ${gbp(th.benchmark_rate_gbp_per_hr)}/hr`,
      figure: fCapacity,
    },
    {
      id: "override",
      group: "Pricing",
      title: "Manual price overrides, up against down",
      note: `${pct(pricing.scale.override_rate, 0)} of jobs`,
      figure: fOverride,
    },
    {
      id: "decomp",
      group: "Margin mix",
      title: "What explains the rate, block by block",
      note: `customer +${cust ? cust.cv_increment.toFixed(3) : "—"} CV R²`,
      figure: fDecomp,
      wide: true,
    },
    {
      id: "rep",
      group: "Margin mix",
      title: "Rep effect before and after controls",
      note: `rep ${rep ? (rep.cv_increment >= 0 ? "+" : "") + rep.cv_increment.toFixed(3) : "—"} CV R²`,
      figure: fRep,
    },
    {
      id: "churn",
      group: "Retention",
      title: "Own cadence against a flat 90-day rule",
      note: `${churn.comparison.n_personalised} vs ${churn.comparison.n_fixed} accounts`,
      figure: fChurn,
    },
    {
      id: "bh",
      group: "Diagnostics",
      title: "Multiplicity correction across the test family",
      note: `rush adj p ${pval(rush.main_effect.p_value_adj)}`,
      figure: fBh,
    },
  ];

  return (
    <>
      <HeroBand
        eyebrow={`Sales analysis · ${data.trend[0]?.year}–${data.as_of.slice(0, 4)}`}
        title="Print-job margin analysis"
        lede={`${num(Number(v.n_rows))} jobs across three years, measured as contribution per press-hour. Press hours are the capacity-constrained resource, so that is the margin measure used throughout rather than gross margin percentage.`}
        meta={
          <>
            <span className="font-mono">{data.source_name}</span>
            <MetaSep />
            <span>
              {v.n_customers} customers · {v.n_reps} reps
            </span>
            <MetaSep />
            <span>
              data to <span className="num">{data.as_of}</span>
            </span>
            <MetaSep />
            <span>{data.scale_caveat}</span>
          </>
        }
      />

      <UploadZone />

      <KpiRow cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="Revenue CAGR 23→25"
          value={pct(data.growth.revenue_cagr)}
          href="/margin"
        />
        <Kpi
          label="Value per job"
          value={pct(data.growth.revenue_per_job_cagr)}
          href="/margin"
        />
        <Kpi
          label="Crossover"
          value={`${th.crossover_hrs.toFixed(1)}h`}
          href="/constraint"
        />
        <Kpi
          label="Hours below benchmark"
          value={`${capacityShare}%`}
          href="/constraint"
        />
        <Kpi
          label="Jobs re-priced"
          value={pct(pricing.scale.override_rate, 0)}
          href="/pricing"
        />
        <Kpi
          label="Accounts to call"
          value={num(churn.comparison.n_personalised)}
          href="/retention"
        />
      </KpiRow>

      <DashboardGrid tiles={tiles} />

      <Signpost
        eyebrow="Headline finding"
        headline={`${capacityShare}% of press capacity earns less than the factory's own average rate`}
        sub={`Contribution per press-hour falls as jobs get bigger, crossing the ${gbp(th.benchmark_rate_gbp_per_hr)}/hr benchmark at ${th.crossover_hrs.toFixed(1)} hours. Above it the pooled rate is ${gbp(th.capacity_share.pooled_rate_above)}/hr.`}
        href="/constraint"
        go="See the constraint"
      />

      <Section
        kicker="Read alongside"
        title="Two results computed, and held back"
        note="Both produced a number. The reason each is held back is what makes the rest worth acting on."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="border border-line bg-white p-4">
            <Chip tone="now">Demoted by our own correction</Chip>
            <p className="mt-2.5 text-[14.5px] font-semibold">
              Short-notice jobs earn less per press-hour —{" "}
              <span className="num">
                {pctPoints(rush.main_effect.pct_effect)}
              </span>
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Raw p = {pval(rush.main_effect.p_value)} becomes{" "}
              {pval(rush.main_effect.p_value_adj)} after the correction, so it is
              dropped from the headlines automatically. It would not mean
              declining the work either: most of the cost base is fixed, so a
              lower-rate hour still beats an idle one. It is an argument for
              pricing the premium, not for turning jobs away.
            </p>
          </div>
          <div className="border border-line bg-white p-4">
            <Chip tone="now">Excluded — selection bias</Chip>
            <p className="mt-2.5 text-[14.5px] font-semibold">
              Overridden jobs show a different margin —{" "}
              <span className="num">
                {pctPoints(pricing.override_effect.effect.pct_effect)}
              </span>
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              This one survives the correction at{" "}
              {pval(pricing.override_effect.effect.p_value_adj)} and is still
              excluded: overrides land on jobs humans chose to adjust. The bias,
              not the p-value, is the problem.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
