import PlotlyChart from "@/components/PlotlyChart";
import { ApiDown } from "@/components/ApiGuard";
import { Inconclusive, NotHeadlineBanner } from "@/components/banners";
import {
  Callout,
  KpiRow,
  PageHeader,
  Readout,
  Section,
  Kpi,
  Table,
  TableFrame,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { ciPctFromLog, dp, gbp, num, pctPoints, pval, seLabel } from "@/lib/format";
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
      <PageHeader
        eyebrow="Size & the constraint"
        title="Big jobs fill the press. Small jobs pay for it."
        lede={
          <>
            Press hours are the capacity-constrained resource, so the margin
            metric is contribution per constraint-hour — throughput accounting,
            not gross margin percentage. {th.litho_only_note}
          </>
        }
      />

      <KpiRow>
        <Kpi
          label="Shape of the curve"
          value={mono.interior_optimum ? "Interior optimum" : "Monotonic decline"}
          detail={`Spearman ρ ${Number(mono.spearman_rho).toFixed(2)} on n ${num(Number(mono.n))} — tested before any banding, so the bins can't manufacture the shape`}
        />
        <Kpi
          label="Factory benchmark"
          value={`${gbp(th.benchmark_rate_gbp_per_hr)}/hr`}
          detail="hour-weighted mean rate — the internal line every job is judged against"
        />
        <Kpi
          label="Crossover threshold"
          value={`${th.crossover_hrs.toFixed(1)}h`}
          detail={`window range ${th.crossover_window_range[0].toFixed(1)}–${th.crossover_window_range[1].toFixed(1)}h · bootstrap 95% CI ${th.crossover_ci95[0].toFixed(1)}–${th.crossover_ci95[1].toFixed(1)}h`}
        />
        <Kpi
          label="Hours above the crossover"
          value={`${Math.round(th.capacity_share.share_of_constraint_hours * 100)}%`}
          detail={`of constraint-hours, earning ${gbp(th.capacity_share.pooled_rate_above)}/hr`}
        />
      </KpiRow>

      <PlotlyChart
        figure={curveFig}
        caption="Read the crossover as a range, not a line: the point estimate, the window-sensitivity range and the bootstrap CI are all reported above because a single number here would be false precision."
      />

      {/* The statement also appears inside the figure; it is repeated as a
          caption because chart annotations are invisible to a screen reader. */}
      <PlotlyChart figure={capacityFig} caption={th.capacity_statement} />

      <Section
        kicker="Short-notice work"
        title="Rush jobs, and why this isn't on the headline slide"
        note="Rush is proxied by bottom-percentile dwell time within a size band — no scheduling data exists in this extract. The effect is negative and reasonably sized, and it still failed the multiplicity correction. It is reported here in full rather than quietly dropped."
      >
        {rush.bh_status === "not_headline" && (
          <NotHeadlineBanner text={rush.bh_note} />
        )}

        {/* The commercial reading, stated next to the statistic so the two
            are never separated. Ink ground, not yellow: this is a statement,
            not a caution, and the page already spends its yellow above. */}
        <Callout label="What this does not say" tone="settled">
          Nothing here argues for declining short-notice work. Most of the cost
          base is fixed, so an hour running at a lower contribution rate still
          beats an idle hour — the finding is an argument for pricing and
          sequencing the premium, not for turning the job away. Declining would
          only pay if the constraint were genuinely binding and a rush job
          displaced a better-rate one, and this extract carries no capacity
          data to establish when that happens.
        </Callout>

        <Readout
          items={[
            {
              label: "Effect on rate",
              value: pctPoints(me.pct_effect),
            },
            {
              label: "95% CI",
              value: ciPctFromLog(me.ci_low, me.ci_high),
            },
            { label: "p (raw)", value: pval(me.p_value) },
            {
              label: "p (BH-adjusted)",
              value: pval(me.p_value_adj),
            },
            { label: "Jobs", value: num(me.n_obs) },
            {
              label: "Std. errors",
              value: seLabel(me.se_type),
              tone: "mono",
            },
          ]}
        />

        <TableFrame caption="Sensitivity to where the rush cut-off is drawn. The sign is stable across every percentile; the significance is not, which is the honest reading.">
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

        <Inconclusive
          title="Does the rush penalty depend on how busy the factory is?"
          note={rush.interaction.inconclusive}
        >
          <Readout
            items={[
              {
                label: "Interaction coef",
                value: dp(rush.interaction.interaction.coef),
              },
              {
                label: "p",
                value: pval(rush.interaction.interaction.p_value),
              },
              {
                label: "Jobs",
                value: num(rush.interaction.interaction.n_obs),
              },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            {rush.interaction.simple_slopes.map((s) => (
              <span
                key={String(s.load_bin)}
                className="num border border-line bg-surface-2 px-3 py-1.5 text-[13px]"
              >
                <span className="text-ink-3">load bin {String(s.load_bin)}</span>{" "}
                <span className="font-semibold">
                  {Number(s.pct_effect).toFixed(1)}%
                </span>{" "}
                <span className="text-ink-3">p {pval(Number(s.p_value))}</span>
              </span>
            ))}
          </div>
        </Inconclusive>
      </Section>

      <Section
        kicker="Multiplicity"
        title="The correction that demoted our own finding"
        note="One Benjamini-Hochberg pass over a family fixed in config before the tests were run, applied once. Anything that fails is stripped of headline status automatically and excluded from the exported slide set — including the rush effect above."
      >
        <PlotlyChart figure={bhFig} />
      </Section>
    </>
  );
}
