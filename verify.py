"""`make verify`: the §8 QA gate.

Runs the full pipeline (src.pipeline: the same code path the API and
asset export use) on data/raw/ and prints one table: every §9 expected
value, the computed value, and PASS / DEVIATION / INFO per row.
Non-zero exit on any DEVIATION. Rows §9 marks as expected-to-shift print
as INFO with direction, never PASS/FAIL.

Tolerances are per-row: exact for counts and identities, generous for
model-derived values.
"""

from __future__ import annotations

import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.config import load_config
from src.pipeline import PipelineResult, run_pipeline

RAW_DIR = Path(__file__).parent / "data" / "raw"


@dataclass(frozen=True)
class Row:
    name: str
    expected: str
    # returns (computed_str, ok), ok=None means informational (INFO)
    compute: Callable[[], tuple[str, bool | None]]


def _status(ok: bool | None) -> str:
    return "INFO" if ok is None else ("PASS" if ok else "DEVIATION")


def build_rows(pr: PipelineResult, cfg: dict[str, Any]) -> list[Row]:
    rep, cr, jobs = pr.validation, pr.clean_report, pr.jobs
    decomp = pr.decomposition.set_index("block")
    th = pr.thresholds
    bh = pr.bh_table.set_index("name")

    def counts() -> tuple[str, bool | None]:
        got = (rep.n_rows, rep.n_customers, rep.n_reps)
        return f"{got[0]} / {got[1]} / {got[2]}", got == (6355, 50, 9)

    def salesin_range() -> tuple[str, bool | None]:
        got = f"{rep.salesin_min} -> {rep.salesin_max}"
        return got, got == "2023-01-03 -> 2026-05-21"

    def quarantined() -> tuple[str, bool | None]:
        return str(cr.n_quarantined_credits), cr.n_quarantined_credits == 225

    def identities() -> tuple[str, bool | None]:
        e1, e2 = rep.identity1_max_err, rep.identity2_max_err
        return f"{e1:.1e} / {e2:.1e}", e1 < 1e-8 and e2 < 1e-8

    def press_hrs_zero() -> tuple[str, bool | None]:
        zero = jobs[jobs["press_hrs"] == 0]
        by_type = zero.groupby("work_type").size().to_dict()
        litho_ok = by_type.get("Litho", 0) <= 144
        digital_ok = (jobs["is_digital"] & (jobs["press_hrs"] > 0)).sum() <= 2
        n_cf = len(pr.constraint)
        return f"{by_type} | constraint frame {n_cf}", litho_ok and digital_ok

    def partial_period() -> tuple[str, bool | None]:
        return (
            f"year {cr.partial_year}, {cr.n_partial_period} rows flagged",
            cr.partial_year == 2026,
        )

    def sample_share() -> tuple[str, bool | None]:
        full = jobs[~jobs["is_partial_period"] & jobs["is_closed"]]
        rev = full.groupby("year")["sell_price_gbp"].sum().mean()
        share = rev / float(cfg["company_turnover_gbp"])
        return f"{share:.1%} (mean full year)", abs(share - 0.54) < 0.05

    def decomp_cv() -> tuple[str, bool | None]:
        # §9 marks this expected-to-shift (post-cleaning, run features
        # added) → INFO with direction, never PASS/FAIL
        blocks = list(decomp.index)
        vals = " / ".join(f"{decomp.loc[b, 'r2_cv']:.3f}" for b in blocks)
        return f"{'/'.join(blocks)}: {vals}", None

    def rep_f() -> tuple[str, bool | None]:
        p = float(decomp.loc["rep", "f_p_vs_prev"])
        return f"p = {p:.3f}", p > 0.01

    def product_block() -> tuple[str, bool | None]:
        p = float(decomp.loc["product", "f_p_vs_prev"])
        inc = float(decomp.loc["product", "cv_increment"])
        iso = bool(decomp.loc["product", "in_sample_only"])
        return f"p = {p:.1e}, CV inc = {inc:+.3f}, in_sample_only = {iso}", iso

    def spearman() -> tuple[str, bool | None]:
        mono = th["monotonicity"]
        rho, interior = mono["spearman_rho"], mono["interior_optimum"]
        return f"rho = {rho:.3f}; interior optimum {interior}", (
            abs(rho - (-0.58)) < 0.12 and not interior
        )

    def bench_xover() -> tuple[str, bool | None]:
        bench, xover = th["benchmark_rate"], th["crossover_hrs"]
        lo, hi = (
            th["window_sensitivity"]["crossover_hrs"].min(),
            th["window_sensitivity"]["crossover_hrs"].max(),
        )
        ci_lo, ci_hi = th["crossover_ci"]
        got = (
            f"GBP {bench:.0f}/hr / {xover:.1f}h "
            f"(win {lo:.1f}-{hi:.1f}, CI {ci_lo:.1f}-{ci_hi:.1f})"
        )
        return got, abs(bench - 766) < 77 and abs(xover - 4.4) < 1.5

    def above_share() -> tuple[str, bool | None]:
        s = th["capacity_share"]["share_of_constraint_hours"]
        r = th["capacity_share"]["pooled_rate_above"]
        return f"{s:.0%} of constraint-hours @ GBP {r:.0f}/hr", (
            abs(s - 0.69) < 0.07 and abs(r - 667) < 67
        )

    def override_row() -> tuple[str, bool | None]:
        s = pr.pricing_scale
        got = (
            f"{s['override_rate']:.0%} / {s['n_up']} up vs {s['n_down']} down / "
            f"{s['net_gbp_per_year'] / 1000:+.0f}k/yr"
        )
        return got, (
            abs(s["override_rate"] - 0.61) < 0.03
            and abs(s["n_up"] - 1551) < 80
            and abs(s["n_down"] - 1005) < 80
            and abs(s["net_gbp_per_year"] - 98_000) < 15_000
        )

    def override_effect_row() -> tuple[str, bool | None]:
        e = pr.pricing_effect
        passes = bool(bh.loc["override_effect", "passes_bh"])
        got = (
            f"{e.pct_effect:+.1f}%, raw p = {e.p_value:.3f}, adj p = "
            f"{e.p_value_adj:.3f}, {'PASSES' if passes else 'fails'} BH"
        )
        # §9 expects this to FAIL BH, under cluster-robust SEs it may
        # not. Effect size is the regression test; the BH fate is
        # reported for the human to adjudicate (see rush row).
        return got, abs((e.pct_effect or 0) - 11.2) < 5 and 0.005 < e.p_value < 0.15

    def rush_row() -> tuple[str, bool | None]:
        # §9's p ~ 2e-5 only reproduces with nonrobust SEs (forbidden by
        # §2.3). Cluster-robust: effect must match ~-5%, raw p < 0.05.
        e = pr.rush_effect
        passes = bool(bh.loc["rush_main_effect", "passes_bh"])
        got = (
            f"{e.pct_effect:+.1f}%, raw p = {e.p_value:.3f}, adj p = "
            f"{e.p_value_adj:.3f}, {'passes' if passes else 'FAILS'} BH"
        )
        return got, abs((e.pct_effect or 0) - (-5.0)) < 2.5 and e.p_value < 0.05

    def bh_summary() -> tuple[str, bool | None]:
        n_pass = int(pr.bh_table["passes_bh"].sum())
        fails = pr.bh_table.loc[~pr.bh_table["passes_bh"], "name"].tolist()
        return f"{n_pass}/7 pass; failing: {fails}", None

    def interaction_row() -> tuple[str, bool | None]:
        p = pr.rush_interaction["interaction"].p_value
        return f"p = {p:.2f}", p > 0.1

    def gini_row() -> tuple[str, bool | None]:
        c = pr.trend_concentration
        got = f"{c['gini']:.2f} / {c['top_1_share']:.0%} / {c['top_10_share']:.0%}"
        return got, (
            abs(c["gini"] - 0.36) < 0.06
            and abs(c["top_1_share"] - 0.11) < 0.03
            and abs(c["top_10_share"] - 0.46) < 0.06
        )

    def churn_gate_row() -> tuple[str, bool | None]:
        med_cv = float(pr.churn_cadence["cv"].median())
        n_fc = int(pr.churn_risk["forecastable"].sum())
        got = f"median CV {med_cv:.2f}; {n_fc}/{len(pr.churn_cadence)} forecastable"
        return got, abs(med_cv - 0.95) < 0.15 and abs(n_fc - 12) <= 3

    def churn_cmp_row() -> tuple[str, bool | None]:
        c = pr.churn_comparison
        got = f"{c['n_fixed']} vs {c['n_personalised']}, sets differ = {c['sets_differ']}"
        return got, (
            abs(c["n_fixed"] - 8) <= 3
            and abs(c["n_personalised"] - 11) <= 3
            and c["sets_differ"]
        )

    def growth_row() -> tuple[str, bool | None]:
        g = pr.trend_growth
        got = f"{g['revenue_cagr']:.1%} / {g['va_margin_change_pts']:+.1f}pts"
        return got, (
            abs(g["revenue_cagr"] - 0.087) < 0.015
            and abs(g["va_margin_change_pts"] - 2.4) < 1.5
        )

    def fx_replication_row() -> tuple[str, bool | None]:
        c = pr.currency_replication
        got = (
            f"Stg rho {c['Stg']['spearman_rho']:.2f} (n={c['Stg']['n']}), "
            f"Euro rho {c['Euro']['spearman_rho']:.2f} (n={c['Euro']['n']})"
        )
        return got, bool(c["holds_in_both"])

    def model_row() -> tuple[str, bool | None]:
        m = pr.pricing_model
        got = (
            f"R2 {m.r2_cv_model:.3f} vs zero {m.r2_cv_baseline_zero:.3f} / "
            f"cust {m.r2_cv_baseline_customer_mean:.3f} / global "
            f"{m.r2_cv_baseline_global_mean:.3f}; AUC {m.auc_direction:.2f}"
        )
        return got, None  # outcome is a finding either way (§5.4)

    return [
        Row("Rows / customers / reps", "6355 / 50 / 9", counts),
        Row("SalesIn range", "2023-01-03 -> 2026-05-21", salesin_range),
        Row("Quarantined (Sell Price <= 0)", "225", quarantined),
        Row("Identity max errors (1 / 2)", "< 1e-8", identities),
        Row("Press hrs = 0 rows", "Digital + 144 Litho (+Outwork/WideFmt)", press_hrs_zero),
        Row("Partial period", "2026 flagged", partial_period),
        Row("Sample share of turnover", "~54%", sample_share),
        Row("Decomp CV R2 (cumulative)", "~.262/.269/.471/.471 pre-clean baseline", decomp_cv),
        Row("Rep block nested F", "p ~ 0.13 (null)", rep_f),
        Row("Product block", "in-sample p<<, small CV inc -> in_sample_only", product_block),
        Row("Spearman size vs rate", "~ -0.58; interior optimum False", spearman),
        Row("Benchmark rate / crossover", "~ GBP 766/hr / ~ 4.4h (range + CI)", bench_xover),
        Row("Above-crossover share", "~69% of constraint-hours @ ~GBP 667/hr", above_share),
        Row("Override rate / direction / net", "~61% / 1551 up vs 1005 down / ~ +98k/yr",
            override_row),
        Row("Override effect", "~ +11.2%, raw p ~ 0.049 (scope: fails BH)",
            override_effect_row),
        Row("Rush main effect", "~ -5.0% (scope p ~ 2e-5 was nonrobust)", rush_row),
        Row("BH pass (7-test family)", "see override/rush rows", bh_summary),
        Row("Rush x load interaction", "not significant, p ~ 0.54", interaction_row),
        Row("Override model vs baselines", "negative result expected (data gap)", model_row),
        Row("Gini / top-1 / top-10", "~0.36 / 11% / 46%", gini_row),
        Row("Interval CV median; forecastable", "~0.95; ~12/50", churn_gate_row),
        Row("Fixed vs personalised churn flags", "8 vs 11, different sets", churn_cmp_row),
        Row("Rev CAGR / VA margin change 23->25", "~8.7% / +2.4pts", growth_row),
        Row("Currency replication (check 1)", "size-rate ordering holds in both",
            fx_replication_row),
    ]


def main(argv: list[str]) -> int:
    if "--sample" in argv:
        data_path: Path | None = Path(__file__).parent / "data" / "sample" / "sample.xlsx"
    else:
        candidates = sorted(RAW_DIR.glob("*.xlsx")) if RAW_DIR.exists() else []
        data_path = candidates[0] if candidates else None
    if data_path is None:
        print("verify: no .xlsx in data/raw/ (use --sample for the fixture)")
        return 2

    cfg = load_config()
    pr = run_pipeline(data_path, cfg)

    rows = build_rows(pr, cfg)
    name_w = max(len(r.name) for r in rows)
    exp_w = max(len(r.expected) for r in rows)

    print(f"\nverify: {data_path.name}  (as_of {pr.clean_report.as_of}, "
          f"seeds {cfg['seeds']})\n")
    print(f"{'CHECK':<{name_w}}  {'EXPECTED':<{exp_w}}  {'COMPUTED':<40}  STATUS")
    print("-" * (name_w + exp_w + 52))

    n_dev = 0
    for row in rows:
        computed, ok = row.compute()
        if ok is False:
            n_dev += 1
        print(f"{row.name:<{name_w}}  {row.expected:<{exp_w}}  {computed:<40}  {_status(ok)}")

    print(f"\n{len(rows)} checks: {len(rows) - n_dev} ok, {n_dev} deviations")
    return 1 if n_dev else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
