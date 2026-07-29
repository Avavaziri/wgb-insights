"""`make assets` — §12 presentation asset export.

Writes every slide-ready artefact to assets/ so slide-building needs no
code. Charts render at 1920x1080 via kaleido from the SAME figures the
app serves — the live demo and the slides are one product.

Adjudicated change: rush_effect.png is NOT exported — the rush effect
fails the BH correction under cluster-robust SEs and the system's own
rule (§5.8) bars BH failures from asset export. bh_family.png ships in
its place: the correction demoting one of our own findings is the
methodology story. findings_summary.md records the exclusion and reason.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

from src.call_list import build_call_list
from src.charts import CHARTS, build_chart
from src.config import load_config
from src.gaps import gap_report
from src.pipeline import PipelineResult, run_pipeline

ASSETS = Path(__file__).parent / "assets"
RAW_DIR = Path(__file__).parent / "data" / "raw"

EXPORT_CHARTS = [  # §12 order; rush_effect cut, bh_family added (see module docstring)
    "trend_context",
    "decomposition_table",
    "rep_confounding",
    "override_scale",
    "rate_curve",
    "capacity_share",
    "bh_family",
    "churn_comparison",
]
assert set(EXPORT_CHARTS) <= set(CHARTS)


def named_examples(pr: PipelineResult) -> list[str]:
    """The §9 named example customers — computed, never hardcoded."""
    jobs, cf = pr.jobs, pr.constraint
    xover = pr.thresholds["crossover_hrs"]
    rev = jobs[jobs["is_closed"]].groupby("customer_id")["sell_price_gbp"].sum()
    top = rev.idxmax()
    top_jobs = int((jobs["customer_id"] == top).sum())

    above = cf[cf["press_hrs"] > xover]
    hrs_by_cust = above.groupby("customer_id")["press_hrs"].sum()
    share = hrs_by_cust / above["press_hrs"].sum()
    biggest_above = share.idxmax()

    rate_by_cust = (
        above.groupby("customer_id")
        .agg(hrs=("press_hrs", "sum"), va=("va_amount_gbp", "sum"))
        .assign(rate=lambda d: d["va"] / d["hrs"])
    )
    at_scale = rate_by_cust[rate_by_cust["hrs"] > rate_by_cust["hrs"].quantile(0.75)]
    cheapest = at_scale["rate"].idxmin()

    return [
        f"{top}: #1 by revenue (GBP {rev.loc[top] / 1e6:.2f}m, {top_jobs} jobs)",
        f"{biggest_above}: {share.loc[biggest_above]:.0%} of above-crossover "
        "constraint-hours",
        f"{cheapest}: {share.loc[cheapest]:.0%} of above-crossover hours at the "
        f"lowest rate at scale (GBP {at_scale.loc[cheapest, 'rate']:,.0f}/hr)",
    ]


def findings_summary(pr: PipelineResult) -> str:
    """The script source for the video: every headline with its full
    §2.2 quartet, every exclusion with its one-line reason, the gaps."""
    th, g, s = pr.thresholds, pr.trend_growth, pr.pricing_scale
    cs, m = th["capacity_share"], pr.pricing_model
    bh = pr.bh_table.set_index("name")
    rush = pr.rush_effect
    n_fc = int(pr.churn_risk["forecastable"].sum())
    med_cv = float(pr.churn_cadence["cv"].median())
    cmp_ = pr.churn_comparison
    conc = pr.trend_concentration
    ci_lo, ci_hi = th["crossover_ci"]
    sens = th["window_sensitivity"]["crossover_hrs"]
    full = pr.jobs[~pr.jobs["is_partial_period"] & pr.jobs["is_closed"]]
    share_turnover = float(
        full.groupby("year")["sell_price_gbp"].sum().mean()
        / float(pr.config["company_turnover_gbp"])
    )
    lines = [
        f"# Findings summary — {pr.source_name} (as_of {pr.clean_report.as_of})",
        "",
        f"Sample ~{share_turnover:.0%} of stated turnover; nothing here "
        "extrapolates. All money GBP after FX keyed on Currency. Constraint "
        "analysis is Litho-only (no press hours elsewhere). Seeds "
        f"{pr.config['seeds']} — every number reproduces.",
        "",
        "## Context",
        f"- Revenue CAGR {g['revenue_cagr']:.1%} (2023->2025) with flat jobs "
        f"({g['jobs_cagr']:+.1%}) and customers {g['customers_first']} -> "
        f"{g['customers_last']}: growth is value per job "
        f"({g['revenue_per_job_cagr']:+.1%}), margin {g['va_margin_change_pts']:+.1f}pts.",
        "",
        "## Headline 1 — pricing governance",
        "- Margin is an account property: customer identity adds "
        f"+{float(pr.decomposition.set_index('block').loc['customer', 'cv_increment']):.2f} "
        "cross-validated R2; product adds nothing out-of-sample (in-sample only); "
        "rep adds nothing (the rep league table would mislead — customer mix).",
        f"- {s['override_rate']:.0%} of constraint-frame jobs are manually re-priced: "
        f"{s['n_up']:,} up vs {s['n_down']:,} down, net "
        f"{s['net_gbp_per_year'] / 1000:+,.0f}k GBP/yr of untracked human judgement.",
        f"- The override is NOT learnable at quote time (GroupKFold R2 "
        f"{m.r2_cv_model:.2f} vs best baseline; direction AUC {m.auc_direction:.2f}): "
        "estimators use information the system doesn't capture — a data gap, "
        "and the case for capturing override reasons in the MIS.",
        "",
        "## Headline 2 — the constraint",
        f"- Contribution per constraint-hour declines monotonically with size "
        f"(Spearman {th['monotonicity']['spearman_rho']:.2f}; no interior optimum — "
        "no 'optimal job size' exists).",
        f"- Crossover threshold {th['crossover_hrs']:.1f}h (window range "
        f"{sens.min():.1f}-{sens.max():.1f}h, bootstrap 95% CI {ci_lo:.1f}-{ci_hi:.1f}h): "
        f"work above it occupies {cs['share_of_constraint_hours']:.0%} of press "
        f"capacity at {cs['pooled_rate_above']:,.0f} GBP/hr vs the factory's own "
        f"average {cs['benchmark']:,.0f} GBP/hr. Descriptive only — no "
        "counterfactual GBP figure is defensible without capacity data.",
        "",
        "## Headline 3 — retention",
        f"- Most reorder timing is near-random (median interval CV {med_cv:.2f}); "
        f"next-order prediction is gated to {n_fc}/{len(pr.churn_cadence)} regular "
        "accounts — the system refuses to invent dates for the rest.",
        f"- Personalised thresholds (own median x (1 + 1.5 x own CV)) flag "
        f"{cmp_['n_personalised']} accounts vs the fixed 90-day rule's "
        f"{cmp_['n_fixed']} — different accounts, not just different counts. "
        "Ranked call list exported.",
        "",
        "## Computed but excluded (with reasons — the register is the audit trail)",
        f"- Rush penalty {rush.pct_effect:+.1f}% (raw p {rush.p_value:.3f}): fails "
        f"the family-wise BH correction (adj p {rush.p_value_adj:.3f}) under the "
        "mandated cluster-robust SEs. Reported as suggestive; excluded from "
        "headlines and this export by the system's own rule. One spoken sentence.",
        f"- Override -> margin (+{pr.pricing_effect.pct_effect:.1f}%, adj p "
        f"{pr.pricing_effect.p_value_adj:.3f}): survives BH but remains excluded — "
        "selection-biased (humans choose which jobs to reprice); shown in-app "
        "under a caution banner only.",
        f"- Rush x load gradient: interaction p "
        f"{pr.rush_interaction['interaction'].p_value:.2f} — consistent with "
        "queueing theory, not established by this data. Appendix only.",
        f"- Concentration: tested negative (Gini {conc['gini']:.2f}, top-1 "
        f"{conc['top_1_share']:.0%}, top-10 {conc['top_10_share']:.0%}) — register line.",
        "",
        "## Data gaps (the investment ask)",
    ]
    for gap in gap_report(pr.jobs, float(pr.config["company_turnover_gbp"])):
        lines.append(f"- **{gap['gap']}** — blocks: {gap['blocks']}")
    lines += ["", "## Named examples"]
    lines += [f"- {ex}" for ex in named_examples(pr)]
    lines += [
        "",
        "## BH family (raw -> adjusted p)",
    ]
    for _, r in pr.bh_table.sort_values("rank").iterrows():
        lines.append(
            f"- {r['name']}: {r['p_raw']:.2g} -> {r['p_adj']:.2g} "
            f"({'passes' if r['passes_bh'] else 'FAILS'})"
        )
    return "\n".join(lines) + "\n"


def main() -> int:
    candidates = sorted(RAW_DIR.glob("*.xlsx")) if RAW_DIR.exists() else []
    if not candidates:
        print("export_assets: no .xlsx in data/raw/")
        return 2
    ASSETS.mkdir(exist_ok=True)
    pr = run_pipeline(candidates[0], load_config())

    for name in EXPORT_CHARTS:
        fig = build_chart(name, pr)
        out = ASSETS / f"{name}.png"
        fig.write_image(out, width=1920, height=1080, scale=1)
        print(f"wrote {out}")

    decomp_csv = ASSETS / "decomposition_table.csv"
    pr.decomposition.round(4).to_csv(decomp_csv, index=False)
    print(f"wrote {decomp_csv}")

    tol = float(pr.config["clean"]["override_tolerance_gbp"])
    call = build_call_list(pr.jobs, pr.churn_risk, tol).head(10)
    call_csv = ASSETS / "call_list_sample.csv"
    call.to_csv(call_csv, index=False)
    print(f"wrote {call_csv}")

    summary = ASSETS / "findings_summary.md"
    summary.write_text(findings_summary(pr), encoding="utf-8")
    print(f"wrote {summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
