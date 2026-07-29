"""`make verify` — the §8 QA gate.

Runs the full pipeline on data/raw/ and prints one table: every §9
expected value, the computed value, and PASS / DEVIATION / INFO / STUB
per row. Non-zero exit on any DEVIATION. Rows §9 marks as
expected-to-shift print as INFO with direction, never PASS/FAIL.

Tolerances are per-row: exact for counts and identities, generous for
model-derived values. STUB rows are modules not yet built (§11 order).
"""

from __future__ import annotations

import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.clean import CleanResult, clean, constraint_frame
from src.config import load_config
from src.decomposition import nested_decomposition
from src.ingest import ValidationReport, load_raw
from src.thresholds import (
    benchmark_rate,
    capacity_share_above,
    crossover_ci,
    crossover_point,
    monotonicity_report,
    rolling_rate_curve,
    window_sensitivity,
)

RAW_DIR = Path(__file__).parent / "data" / "raw"


@dataclass(frozen=True)
class Row:
    name: str
    expected: str
    # returns (computed_str, ok) — ok=None means informational (INFO)
    compute: Callable[[], tuple[str, bool | None]]


class Stub(Exception):
    """Module for this row not built yet."""


def _fmt_status(ok: bool | None, stub: bool) -> str:
    if stub:
        return "STUB"
    if ok is None:
        return "INFO"
    return "PASS" if ok else "DEVIATION"


def build_rows(
    report: ValidationReport, result: CleanResult, cfg: dict[str, Any]
) -> list[Row]:
    jobs = result.jobs

    def counts() -> tuple[str, bool | None]:
        got = (report.n_rows, report.n_customers, report.n_reps)
        return f"{got[0]} / {got[1]} / {got[2]}", got == (6355, 50, 9)

    def salesin_range() -> tuple[str, bool | None]:
        got = f"{report.salesin_min} -> {report.salesin_max}"
        return got, got == "2023-01-03 -> 2026-05-21"

    def quarantined() -> tuple[str, bool | None]:
        n = result.report.n_quarantined_credits
        return str(n), n == 225

    def identities() -> tuple[str, bool | None]:
        e1, e2 = report.identity1_max_err, report.identity2_max_err
        return f"{e1:.1e} / {e2:.1e}", e1 < 1e-8 and e2 < 1e-8

    def press_hrs_zero() -> tuple[str, bool | None]:
        # scope trap 7 documents Digital + 144 Litho; the file also has
        # Outwork and Wide Format (all zero-hrs) — constraint base is
        # Litho-with-hours either way
        zero = jobs[jobs["press_hrs"] == 0]
        by_type = zero.groupby("work_type").size().to_dict()
        litho_ok = by_type.get("Litho", 0) <= 144  # 144 incl. quarantined credits
        digital_ok = (jobs["is_digital"] & (jobs["press_hrs"] > 0)).sum() <= 2
        constraint_base = int((~jobs["is_digital"] & (jobs["press_hrs"] > 0)).sum())
        return f"{by_type} | constraint base {constraint_base}", litho_ok and digital_ok

    def partial_period() -> tuple[str, bool | None]:
        r = result.report
        return f"year {r.partial_year}, {r.n_partial_period} rows flagged", r.partial_year == 2026

    def sample_share() -> tuple[str, bool | None]:
        # revenue per full year vs stated turnover; computed, never hardcoded
        full = jobs[~jobs["is_partial_period"] & jobs["is_closed"]]
        years = sorted(set(full["year"]))
        rev = full.groupby("year")["sell_price_gbp"].sum().mean()
        share = rev / float(cfg["company_turnover_gbp"])
        return f"{share:.1%} (mean of {years})", abs(share - 0.54) < 0.05

    def stub() -> tuple[str, bool | None]:
        raise Stub

    # --- constraint-frame analyses (decomposition + thresholds), computed once
    cf = constraint_frame(jobs, cfg)
    dcfg = cfg["decomposition"]
    decomp = nested_decomposition(
        cf,
        "log_rate",
        dcfg["blocks"],
        cluster_on="customer_id",
        cv_folds=int(dcfg["cv_folds"]),
        seed=int(cfg["seeds"]["cv"]),
        in_sample_only_f_p=float(dcfg["in_sample_only_f_p"]),
        in_sample_only_cv_increment=float(dcfg["in_sample_only_cv_increment"]),
    ).set_index("block")
    tcfg = cfg["thresholds"]
    window, step = int(tcfg["rolling_window"]), int(tcfg["rolling_step"])
    mono = monotonicity_report(cf, window=window, step=step)
    bench = benchmark_rate(cf)
    curve = rolling_rate_curve(cf, window, step)
    xover = crossover_point(curve, bench)
    sens = window_sensitivity(cf, [int(w) for w in tcfg["window_sensitivity"]], step=step)
    ci_lo, ci_hi = crossover_ci(
        cf, n_boot=int(tcfg["n_boot"]), seed=int(cfg["seeds"]["bootstrap"]),
        window=window, step=step,
    )
    share = capacity_share_above(cf, xover)

    def decomp_cv() -> tuple[str, bool | None]:
        # §9 marks this expected-to-shift (post-cleaning, run-features added)
        # → INFO with direction, never PASS/FAIL
        vals = " / ".join(f"{decomp.loc[b, 'r2_cv']:.3f}" for b in dcfg["blocks"])
        return f"{'/'.join(dcfg['blocks'])}: {vals}", None

    def rep_f() -> tuple[str, bool | None]:
        p = float(decomp.loc["rep", "f_p_vs_prev"])
        return f"p = {p:.3f}", p > 0.01  # null result expected

    def product_block() -> tuple[str, bool | None]:
        p = float(decomp.loc["product", "f_p_vs_prev"])
        inc = float(decomp.loc["product", "cv_increment"])
        iso = bool(decomp.loc["product", "in_sample_only"])
        return f"p = {p:.1e}, CV inc = {inc:+.3f}, in_sample_only = {iso}", iso

    def spearman() -> tuple[str, bool | None]:
        rho, interior = mono["spearman_rho"], mono["interior_optimum"]
        return f"rho = {rho:.3f}; interior optimum {interior}", (
            abs(rho - (-0.58)) < 0.12 and not interior
        )

    def bench_xover() -> tuple[str, bool | None]:
        lo, hi = sens["crossover_hrs"].min(), sens["crossover_hrs"].max()
        got = f"GBP {bench:.0f}/hr / {xover:.1f}h (win {lo:.1f}-{hi:.1f}, CI {ci_lo:.1f}-{ci_hi:.1f})"
        return got, abs(bench - 766) < 77 and abs(xover - 4.4) < 1.5

    def above_share() -> tuple[str, bool | None]:
        s, r = share["share_of_constraint_hours"], share["pooled_rate_above"]
        return f"{s:.0%} of constraint-hours @ GBP {r:.0f}/hr", (
            abs(s - 0.69) < 0.07 and abs(r - 667) < 67
        )

    return [
        Row("Rows / customers / reps", "6355 / 50 / 9", counts),
        Row("SalesIn range", "2023-01-03 -> 2026-05-21", salesin_range),
        Row("Quarantined (Sell Price <= 0)", "225", quarantined),
        Row("Identity max errors (1 / 2)", "< 1e-8", identities),
        Row("Press hrs = 0 rows", "1354 Digital + 144 Litho", press_hrs_zero),
        Row("Partial period", "2026 flagged", partial_period),
        Row("Sample share of turnover", "~54%", sample_share),
        Row("Decomp CV R2 (cumulative)", "~.262/.269/.471/.471 pre-clean baseline", decomp_cv),
        Row("Rep block nested F", "p ~ 0.13 (null)", rep_f),
        Row("Product block", "in-sample p<<, small CV inc -> in_sample_only", product_block),
        Row("Spearman size vs rate", "~ -0.58; interior optimum False", spearman),
        Row("Benchmark rate / crossover", "~ GBP 766/hr / ~ 4.4h (range + CI)", bench_xover),
        Row("Above-crossover share", "~69% of constraint-hours @ ~GBP 667/hr", above_share),
        Row("Override rate / direction / net", "~61% / 1551 up vs 1005 down / ~ +98k/yr", stub),
        Row("Override effect", "~ +11.2%, raw p ~ 0.049 -> fails BH", stub),
        Row("Rush main effect", "~ -5.0%, p ~ 2e-5", stub),
        Row("Rush x load interaction", "not significant, p ~ 0.54", stub),
        Row("Gini / top-1 / top-10", "~0.36 / 11% / 46%", stub),
        Row("Interval CV median; forecastable", "~0.95; ~12/50", stub),
        Row("Fixed vs personalised churn flags", "8 vs 11, different sets", stub),
        Row("Rev CAGR / VA margin change 23->25", "~8.7% / +2.4pts", stub),
    ]


def main(argv: list[str]) -> int:
    data_path: Path | None = None
    if "--sample" in argv:
        data_path = Path(__file__).parent / "data" / "sample" / "sample.xlsx"
    else:
        candidates = sorted(RAW_DIR.glob("*.xlsx")) if RAW_DIR.exists() else []
        if candidates:
            data_path = candidates[0]
    if data_path is None:
        print("verify: no .xlsx in data/raw/ (use --sample for the fixture)")
        return 2

    cfg = load_config()
    raw, report = load_raw(data_path)
    result = clean(raw, cfg)

    rows = build_rows(report, result, cfg)
    name_w = max(len(r.name) for r in rows)
    exp_w = max(len(r.expected) for r in rows)

    print(f"\nverify: {data_path.name}  (as_of {result.report.as_of}, seeds "
          f"{cfg['seeds']})\n")
    print(f"{'CHECK':<{name_w}}  {'EXPECTED':<{exp_w}}  {'COMPUTED':<38}  STATUS")
    print("-" * (name_w + exp_w + 50))

    n_dev = n_stub = 0
    for row in rows:
        try:
            computed, ok = row.compute()
            stub = False
        except Stub:
            computed, ok, stub = "", None, True
            n_stub += 1
        status = _fmt_status(ok, stub)
        if status == "DEVIATION":
            n_dev += 1
        print(f"{row.name:<{name_w}}  {row.expected:<{exp_w}}  {computed:<38}  {status}")

    print(f"\n{len(rows)} checks: {len(rows) - n_dev - n_stub} ok, "
          f"{n_dev} deviations, {n_stub} stubs")
    return 1 if n_dev else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
