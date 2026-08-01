import Link from "next/link";
import PlotlyChart from "@/components/PlotlyChart";
import { ApiDown } from "@/components/ApiGuard";
import HeroBand from "@/components/HeroBand";
import UploadZone from "@/components/UploadZone";
import {
  Chip,
  DefList,
  Disclosure,
  Evidence,
  Kpi,
  KpiBand,
  MetaSep,
  NoteCard,
  PageHeader,
  Panel,
  PanelHead,
  Readout,
  Section,
  Table,
  TableFrame,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import {
  ciPctFromLog,
  dash,
  dp,
  expo,
  gbp,
  gbpK,
  num,
  pct,
  pctPoints,
  pval,
  seLabel,
} from "@/lib/format";
import { API_BASE, ApiDownError, getChart, getJson } from "@/lib/api";
import type {
  Churn,
  Decomposition,
  Overview,
  Pricing,
  Rush,
  Thresholds,
} from "@/lib/types";

// The overview is the brief's page one: upload, summary information,
// validation and gap reports, the trend chart, the scale caveat. Everything
// methodological folds into the evidence section at the bottom, one click
// away, so a board reads a summary and an interviewer can still open every
// proof without leaving the page.
export default async function OverviewPage() {
  let data: Overview;
  let th: Thresholds;
  let dec: Decomposition;
  let pricing: Pricing;
  let rush: Rush;
  let churn: Churn;
  let trendFig: unknown;
  let bhFig: unknown;
  try {
    [data, th, dec, pricing, rush, churn, trendFig, bhFig] = await Promise.all([
      getJson<Overview>("/overview"),
      getJson<Thresholds>("/thresholds"),
      getJson<Decomposition>("/decomposition"),
      getJson<Pricing>("/pricing"),
      getJson<Rush>("/rush"),
      getJson<Churn>("/churn"),
      getChart("trend_context", { compact: true }),
      getChart("bh_family"),
    ]);
  } catch (e) {
    if (e instanceof ApiDownError) return <ApiDown message={e.message} />;
    throw e;
  }

  const v = data.validation;
  const c = data.clean_report;
  const cap = th.capacity_share;
  const cust = dec.rows.find((r) => r.block === "customer");
  const me = rush.main_effect;
  const oe = pricing.override_effect.effect;
  const m = pricing.model;
  const rp = dec.rep_pair;
  const churnAccounts = churn.comparison.n_personalised;

  // Three findings, one card each: area, the claim, the single number that
  // carries it, one qualifying line. The full argument lives one click away.
  const findings = [
    {
      area: "Pricing",
      claim: "Margin is an account property",
      figure: `+${cust ? cust.cv_increment.toFixed(2) : dash}`,
      figureLabel: "out-of-sample R² from customer identity",
      support: `Product and rep add ~nothing; ${pct(pricing.scale.override_rate, 0)} of prices are re-priced by hand, net ${gbp(pricing.scale.net_gbp_per_year)}/yr.`,
      href: "/dashboards",
      link: "Pricing panels",
    },
    {
      area: "Capacity",
      claim: "The press is filled by the work that pays it least",
      figure: pct(cap.share_of_constraint_hours, 0),
      figureLabel: `of litho hours in jobs over ${th.crossover_hrs.toFixed(1)}h`,
      support: `Earning ${gbp(cap.pooled_rate_above)}/hr against the factory's own ${gbp(th.benchmark_rate_gbp_per_hr)}/hr average. No optimal size exists.`,
      href: "/dashboards",
      link: "Capacity panels",
    },
    {
      area: "Retention",
      claim: "The call list is gated, not guessed",
      figure: num(churnAccounts),
      figureLabel: "accounts silent beyond their own cadence",
      support:
        "Regular accounts get a predicted next order; the rest get a risk band and a reason, never an invented date.",
      href: "/actions",
      link: "Open the call list",
    },
  ];

  return (
    <>
      <HeroBand />
      <UploadZone />

      <PageHeader
        eyebrow="Overview"
        title="Print-job sales, live from the file"
        meta={
          <>
            <span className="font-mono">{data.source_name}</span>
            <MetaSep />
            <span>
              {num(Number(v.n_rows))} jobs · {v.n_customers} customers ·{" "}
              {v.n_reps} reps
            </span>
            <MetaSep />
            <span>
              to <span className="num">{data.as_of}</span>
            </span>
            <MetaSep />
            <span>~{pct(data.sample_share_of_turnover, 0)} of turnover</span>
          </>
        }
      />

      <KpiBand>
        <Kpi
          label="Revenue CAGR 23→25"
          value={pct(data.growth.revenue_cagr)}
          sub="full years only"
          href="/dashboards"
        />
        <Kpi
          label="Value per job"
          value={pct(data.growth.revenue_per_job_cagr)}
          sub="growth is price and mix"
          href="/dashboards"
        />
        <Kpi
          label="Crossover size"
          value={`${th.crossover_hrs.toFixed(1)}h`}
          sub={`CI ${th.crossover_ci95[0].toFixed(1)}–${th.crossover_ci95[1].toFixed(1)}h`}
          href="/dashboards"
        />
        <Kpi
          label="Hours over that size"
          value={pct(cap.share_of_constraint_hours, 0)}
          sub={`at ${gbp(cap.pooled_rate_above)}/hr`}
          href="/dashboards"
        />
        <Kpi
          label="Jobs re-priced by hand"
          value={pct(pricing.scale.override_rate, 0)}
          sub={`net ${gbpK(pricing.scale.net_gbp_per_year)}/yr`}
          href="/dashboards"
        />
        <Kpi
          label="Accounts to call"
          value={num(churnAccounts)}
          sub="own-cadence rule"
          href="/actions"
        />
      </KpiBand>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel>
            <PanelHead meta={`CAGR ${pct(data.growth.revenue_cagr)} · ${data.partial_year} partial greyed`}>
              Growth is value per job, not volume
            </PanelHead>
            <PlotlyChart figure={trendFig} tall />
          </Panel>
        </div>
        <div className="grid content-start gap-3">
          {findings.map((f) => (
            <Link
              key={f.claim}
              href={f.href}
              className="plain group block border border-line bg-white px-4 py-3 no-underline transition-colors hover:bg-hover"
            >
              <span className="eyebrow block text-[10px]">{f.area}</span>
              <span className="mt-1 block text-[14px] font-semibold leading-snug">
                {f.claim}
              </span>
              <span className="mt-1 block text-[12px] leading-snug text-muted">
                <span className="num font-semibold text-ink">{f.figure}</span>{" "}
                {f.figureLabel}. {f.support}
              </span>
              <span className="mt-1.5 block text-[12px] font-semibold underline underline-offset-2">
                {f.link}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <Section
        kicker="Data health"
        title="Checks on the current file, and what it can't answer"
        note="If the pricing identity ever fails on an upload, the pricing analysis withholds its numbers rather than guess what a column means."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <DefList
            title="Ingest checks"
            rows={[
              {
                label: (
                  <>
                    <code>VA/24</code> identity, max error
                  </>
                ),
                value: expo(Number(v.identity1_max_err)),
              },
              {
                label: (
                  <>
                    <code>mupnett = labmup + manadj</code>, max error (
                    {num(Number(v.n_identity2_checked))} rows)
                  </>
                ),
                value: v.identity2_ok
                  ? expo(Number(v.identity2_max_err))
                  : "FAILED, pricing withheld",
              },
              {
                label: (
                  <>
                    <code>#DIV/0!</code> cells counted before coercion
                  </>
                ),
                value: num(Number(v.va_pct_error_cells)),
              },
              {
                label: (
                  <>
                    Blank <code>manadj</code>, held out of overrides
                  </>
                ),
                value: num(Number(v.n_null_manadj)),
              },
              {
                label: "Blank binding = outsourced (data, not absence)",
                value: num(Number(v.n_null_binding)),
              },
              {
                label: "Zero press-hours jobs (capacity is Litho-only)",
                value: num(Number(v.n_press_hrs_zero)),
              },
              {
                label: "Credits quarantined, never silently dropped",
                value: num(Number(c.n_quarantined_credits)),
              },
            ]}
          />
          <Panel>
            <PanelHead meta="the investment ask">
              What the data cannot answer
            </PanelHead>
            <ul className="m-0 divide-y divide-line">
              {data.gaps.map((g) => (
                <li
                  key={g.gap}
                  className="flex items-baseline justify-between gap-4 px-4 py-2"
                >
                  <p className="text-[13px] font-semibold leading-snug">
                    {g.gap}
                  </p>
                  <p className="shrink-0 max-w-[16rem] text-right text-[11.5px] leading-snug text-muted">
                    {g.blocks}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </Section>

      <Section
        kicker="Evidence & method"
        title="Every proof, one click deep"
        note="The statistics behind each claim, including two results held back and the hypotheses that failed."
      >
        <Disclosure
          title={`Every hypothesis tested: ${data.hypothesis_register.length} of them`}
          hint="registered before the results were known"
        >
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Hypothesis</Th>
                  <Th>Outcome</Th>
                  <Th>Status</Th>
                  <Th>Evidence</Th>
                </tr>
              </thead>
              <tbody>
                {data.hypothesis_register.map((e) => (
                  <Tr key={e.id}>
                    <Td className="font-semibold">{e.hypothesis}</Td>
                    <Td muted>{e.outcome}</Td>
                    <Td>
                      <Chip tone={e.status === "headline" ? "solid" : "outline"}>
                        {e.status.replace("_", " ")}
                      </Chip>
                    </Td>
                    <Td muted className="text-[12.5px]">
                      {e.evidence}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Disclosure>

        <Disclosure
          title="What explains margin, block by block"
          hint="nested decomposition"
        >
          <TableFrame caption="CV increment is the change in out-of-sample R² when the block is added, in the fixed config order. The in-sample-only marker records a block that clears the nested F-test decisively while adding almost no predictive power: statistically present, practically negligible.">
            <Table>
              <thead>
                <tr>
                  <Th align="right">Step</Th>
                  <Th>Block (cumulative)</Th>
                  <Th align="right">R²</Th>
                  <Th align="right">adj R²</Th>
                  <Th align="right">CV R²</Th>
                  <Th align="right">CV increment</Th>
                  <Th align="right">params</Th>
                  <Th align="right">nested F p</Th>
                </tr>
              </thead>
              <tbody>
                {dec.rows.map((r, i) => (
                  <Tr key={r.block} highlight={r.block === "customer"}>
                    <Td align="right" num muted className="w-10">
                      {i + 1}
                    </Td>
                    <Td className="font-medium">
                      <span className="text-line">+ </span>
                      {r.block}
                      {r.in_sample_only && (
                        <span className="ml-2 align-middle">
                          <Chip tone="outline">in-sample only</Chip>
                        </span>
                      )}
                    </Td>
                    <Td align="right" num muted>
                      {dp(r.r2)}
                    </Td>
                    <Td align="right" num muted>
                      {dp(r.r2_adj)}
                    </Td>
                    <Td align="right" num className="font-semibold">
                      {dp(r.r2_cv)}
                    </Td>
                    <Td
                      align="right"
                      num
                      className={
                        Number(r.cv_increment.toFixed(3)) === 0
                          ? "text-muted"
                          : "font-semibold"
                      }
                    >
                      {r.cv_increment >= 0 ? "+" : ""}
                      {r.cv_increment.toFixed(3)}
                    </Td>
                    <Td align="right" num muted>
                      {r.n_params}
                    </Td>
                    <Td align="right" num muted>
                      {r.f_p_vs_prev === null ? dash : pval(r.f_p_vs_prev)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableFrame>
          <p className="measure text-[13.5px] font-medium leading-relaxed">
            {rp.conclusion}
          </p>
          <Readout
            items={[
              { label: "Naive rep model", value: `CV R² ${dp(rp.naive.r2_cv)}` },
              { label: "Naive formula", value: rp.naive.formula, tone: "mono" },
              { label: "Jobs", value: num(rp.naive.n_obs) },
              { label: "Controlled nested F p", value: pval(rp.controlled_f_p) },
              {
                label: "Controlled CV gain",
                value: `${rp.controlled_cv_increment >= 0 ? "+" : ""}${rp.controlled_cv_increment.toFixed(3)}`,
              },
              {
                label: "adj R² gain",
                value: `${rp.controlled_adj_increment >= 0 ? "+" : ""}${rp.controlled_adj_increment.toFixed(3)}`,
              },
            ]}
          />
        </Disclosure>

        <Disclosure
          title="The correction that demoted our own finding"
          hint="one BH pass, fixed family"
        >
          <p className="measure text-[13.5px] leading-relaxed">
            One Benjamini-Hochberg pass over a family of seven tests fixed
            before any test was run. Anything failing loses headline status
            automatically and is excluded from the exported slides, so no one
            decides case by case.
          </p>
          <PlotlyChart figure={bhFig} />
        </Disclosure>

        <Disclosure
          title="Two results computed, and held back"
          hint="the reasons matter more than the numbers"
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <NoteCard
              chip="Demoted by our own correction"
              claim={
                <>
                  Short-notice jobs earn less per press-hour:{" "}
                  <span className="num">{pctPoints(me.pct_effect)}</span>
                </>
              }
            >
              Raw p = {pval(me.p_value)} becomes {pval(me.p_value_adj)} after
              the correction, so it is dropped from the headlines
              automatically. It would not mean declining the work either: most
              of the cost base is fixed, so a lower-rate hour still beats an
              idle one. It is an argument for pricing the premium, not for
              turning jobs away.
            </NoteCard>
            <NoteCard
              chip="Excluded for selection bias"
              claim={
                <>
                  Overridden jobs show a different margin:{" "}
                  <span className="num">{pctPoints(oe.pct_effect)}</span>
                </>
              }
            >
              This one survives the correction at {pval(oe.p_value_adj)} and is
              still excluded: overrides land on jobs humans chose to adjust.
              The bias, not the p-value, is the problem.
            </NoteCard>
          </div>
          <Evidence
            label="Rush effect: full statistical readout"
            items={[
              { label: "Effect on rate", value: pctPoints(me.pct_effect) },
              { label: "95% CI", value: ciPctFromLog(me.ci_low, me.ci_high) },
              { label: "p (raw)", value: pval(me.p_value) },
              { label: "p (BH-adjusted)", value: pval(me.p_value_adj) },
              { label: "Jobs", value: num(me.n_obs) },
              { label: "Std. errors", value: seLabel(me.se_type), tone: "mono" },
            ]}
          />
          <Evidence
            label="Override effect: full statistical readout"
            items={[
              { label: "Effect on rate", value: pctPoints(oe.pct_effect) },
              { label: "95% CI", value: ciPctFromLog(oe.ci_low, oe.ci_high) },
              { label: "p (raw)", value: pval(oe.p_value) },
              { label: "p (BH-adjusted)", value: pval(oe.p_value_adj) },
              { label: "Jobs", value: num(oe.n_obs) },
              { label: "Std. errors", value: seLabel(oe.se_type), tone: "mono" },
            ]}
          />
        </Disclosure>

        <Disclosure
          title="Can the overrides be predicted? A negative result"
          hint="the baselines are the proof"
        >
          <p className="measure text-[13.5px] leading-relaxed">
            If a model could predict the override from what is known at quote
            time, the adjustment could be built into the price list. It
            cannot: {m.model_family}, GroupKFold grouped on customer so no
            account appears in both training and test data, scored against
            zero-effort baselines.
          </p>
          <Readout
            items={[
              { label: "Model, quote-time features", value: dp(m.r2_cv_model) },
              { label: "Baseline: predict zero", value: dp(m.r2_cv_baseline_zero) },
              {
                label: "Baseline: customer mean",
                value: dp(m.r2_cv_baseline_customer_mean),
              },
              {
                label: "Baseline: global mean",
                value: dp(m.r2_cv_baseline_global_mean),
              },
              { label: "Direction AUC (coin flip 0.50)", value: dp(m.auc_direction, 2) },
              { label: "Jobs / customers", value: `${num(m.n_obs)} / ${num(m.n_clusters)}` },
            ]}
          />
          <p className="measure text-[13.5px] font-medium leading-relaxed">
            {m.finding}
          </p>
        </Disclosure>

        <Disclosure
          title="The rush finding: sensitivity, and the interaction that failed"
          hint="threshold sensitivity + rush × load"
        >
          <TableFrame caption="Rush is proxied by bottom-percentile dwell time within a size band; no scheduling data exists in this extract. The sign is stable across every percentile; the significance is not, which is the honest reading and part of why the finding was demoted.">
            <Table>
              <thead>
                <tr>
                  <Th>Flag percentile</Th>
                  <Th align="right">Effect on rate</Th>
                  <Th align="right">raw p</Th>
                  <Th align="right">n flagged</Th>
                </tr>
              </thead>
              <tbody>
                {rush.percentile_sensitivity.map((r) => (
                  <Tr key={r.percentile}>
                    <Td num>{(r.percentile * 100).toFixed(0)}%</Td>
                    <Td align="right" num className="font-semibold">
                      {r.pct_effect.toFixed(1)}%
                    </Td>
                    <Td align="right" num muted>
                      {pval(r.p_value)}
                    </Td>
                    <Td align="right" num muted>
                      {num(r.n_rush)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableFrame>
          {/* Adjudicated: the descriptive load gradient may only ever appear
              adjacent to the failed interaction test, never on its own. */}
          <p className="measure text-[13.5px] leading-relaxed">
            {rush.interaction.inconclusive}
          </p>
          <Evidence
            label="Rush × load interaction: full statistical readout"
            items={[
              {
                label: "Interaction coef",
                value: dp(rush.interaction.interaction.coef),
              },
              { label: "p", value: pval(rush.interaction.interaction.p_value) },
              { label: "Jobs", value: num(rush.interaction.interaction.n_obs) },
            ]}
          >
            <div className="flex flex-wrap gap-2">
              {rush.interaction.simple_slopes.map((s) => (
                <span
                  key={String(s.load_bin)}
                  className="num border border-line bg-white px-3 py-1.5 text-[12.5px]"
                >
                  <span className="text-muted">
                    load bin {String(s.load_bin)}
                  </span>{" "}
                  <span className="font-semibold">
                    {Number(s.pct_effect).toFixed(1)}%
                  </span>{" "}
                  <span className="text-muted">p {pval(Number(s.p_value))}</span>
                </span>
              ))}
            </div>
          </Evidence>
        </Disclosure>

        <Disclosure
          title="Reproducing and interrogating the numbers"
          hint="seeds, API, standards"
        >
          <ul className="m-0 list-none space-y-2 text-[13.5px] leading-relaxed">
            <li>
              Every job-level model uses cluster-robust standard errors on
              customer, and no effect is reported without its CI, p, n and
              SE type: the result records make a bare number impossible.
            </li>
            <li>
              Thresholds are derived, never chosen, and always reported as a
              range with a bootstrap interval (crossover:{" "}
              <span className="num">
                {th.crossover_window_range[0].toFixed(1)}–
                {th.crossover_window_range[1].toFixed(1)}h window range,{" "}
                {th.crossover_ci95[0].toFixed(1)}–{th.crossover_ci95[1].toFixed(1)}h
                95% CI
              </span>
              ).
            </li>
            <li>
              The as-of date comes from the latest sale in the file, never
              the clock, so the same file gives the same answers on any day.
            </li>
            <li>
              Seeds are fixed (
              {Object.entries(data.seeds)
                .map(([k, s]) => `${k} ${s}`)
                .join(", ")}
              ), so a rerun reproduces exactly.
            </li>
            <li>
              Machine-readable results and full field definitions:{" "}
              <a href={`${API_BASE}/docs`}>{API_BASE}/docs</a>
            </li>
          </ul>
        </Disclosure>
      </Section>
    </>
  );
}
