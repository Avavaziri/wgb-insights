import PlotlyChart from "@/components/PlotlyChart";
import { ApiDown } from "@/components/ApiGuard";
import { CautionBanner } from "@/components/banners";
import {
  Chip,
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
import { ciPctFromLog, dp, gbpK, num, pct, pctPoints, pval, seLabel } from "@/lib/format";
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

  const baselines = [
    { label: "Model, quote-time features only", value: m.r2_cv_model, model: true },
    { label: "Baseline: predict zero", value: m.r2_cv_baseline_zero, model: false },
    { label: "Baseline: customer mean", value: m.r2_cv_baseline_customer_mean, model: false },
    { label: "Baseline: global mean", value: m.r2_cv_baseline_global_mean, model: false },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Pricing & overrides"
        title="Estimators override the quoted price on most jobs."
        lede={
          <>
            <code>manadj</code> is a £ price override, and it is provably that
            because <code>mupnett = labmup + manadj</code> holds to 10⁻¹² across
            the file. If that identity ever breaks on a new upload, this page
            refuses to render numbers rather than guess what the column means.
          </>
        }
      />

      <KpiRow>
        <Kpi
          label="Override rate"
          value={pct(s.override_rate, 0)}
          detail={
            `|manadj| > £${s.tolerance_gbp}, a tolerance derived from the observed bimodal gap rather than chosen` +
            (s.n_unknown_manadj > 0
              ? ` · ${num(s.n_unknown_manadj)} rows with a null override excluded`
              : "")
          }
        />
        <Kpi
          label="Priced up"
          value={num(s.n_up)}
          detail="estimator raised the calculated price"
        />
        <Kpi
          label="Priced down"
          value={num(s.n_down)}
          detail="estimator discounted it"
        />
        <Kpi
          label="Net human judgement"
          value={`${gbpK(s.net_gbp_per_year)}/yr`}
          detail={`gross ${gbpK(s.gross_gbp_per_year)}/yr across ${s.span_years.toFixed(1)} years of data`}
        />
      </KpiRow>

      <PlotlyChart figure={scaleFig} />

      <Section
        kicker="Negative result"
        title="Is the override learnable?"
        note="If a model could predict the override from what is known at quote time, the adjustment could be built into the price list. It can't, and the baselines are what prove it, since an R² near zero is only meaningless once you know what zero-effort prediction scores."
      >
        <TableFrame
          caption={`${m.model_family}, GroupKFold grouped on customer, ${m.cv_folds} folds. Grouping matters: plain KFold would put the same account in train and test and leak its pricing habits into the score.`}
        >
          <Table>
            <thead>
              <tr>
                <Th>Predictor</Th>
                <Th align="right">Out-of-fold R²</Th>
              </tr>
            </thead>
            <tbody>
              {baselines.map((b) => (
                <Tr key={b.label}>
                  <Td className={b.model ? "font-semibold" : ""}>
                    {b.label}
                    {b.model && !m.beats_all_baselines && (
                      <span className="ml-2 align-middle">
                        <Chip tone="done">loses to baselines</Chip>
                      </span>
                    )}
                  </Td>
                  <Td
                    align="right"
                    num
                    className={b.model ? "font-semibold" : "text-ink-3"}
                  >
                    {dp(b.value)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableFrame>

        <Readout
          items={[
            { label: "Direction AUC", value: dp(m.auc_direction, 2) },
            { label: "Coin flip", value: "0.50" },
            { label: "Jobs", value: num(m.n_obs) },
            { label: "Customers", value: num(m.n_clusters) },
          ]}
        />
        <p className="measure text-[15px] font-medium leading-relaxed">
          {m.finding}
        </p>
      </Section>

      <Section
        kicker="Computed, deliberately not presented"
        title="The override → margin question"
        note="Exclusion here is a communication decision, not a missing number: it is computed, recorded in the register, and shown with the reason it can't carry a claim."
      >
        <CautionBanner text={data.override_effect.caution} />
        <Readout
          items={[
            { label: "Effect on rate", value: pctPoints(e.pct_effect) },
            { label: "95% CI", value: ciPctFromLog(e.ci_low, e.ci_high) },
            { label: "p (raw)", value: pval(e.p_value) },
            { label: "p (BH-adjusted)", value: pval(e.p_value_adj) },
            { label: "Jobs", value: num(e.n_obs) },
            {
              label: "Std. errors",
              value: seLabel(e.se_type),
              tone: "mono",
            },
          ]}
        />
      </Section>
    </>
  );
}
