"""Nested variance decomposition: where does margin variation live? (§5.2)

Target: log(contribution per constraint-hour), clipped at the config
floor (GBP/hr). Blocks are added cumulatively in config order; each step
reports the full §2.1 quartet plus increments and a nested F-test
against the previous step. The run-features block tests the
run-length-economics mechanism, does job size still matter once
quantity, impressions and plates are controlled? Either answer ships.

Increments are order-dependent; the run uses config order only (the
reversed pass was an adjudicated cut: one README appendix sentence).
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from src.stats_core import ModelReport, fit_reported, nested_f_test

BLOCK_TERMS: dict[str, str] = {
    "size": "np.log(press_hrs)",
    # log1p: Impressions (and rarely Quantity) can be 0 on real Litho rows;
    # log1p keeps those jobs in the frame rather than silently dropping them
    "run_features": "np.log1p(quantity) + np.log1p(impressions) + plates",
    "product": "C(product_type)",
    "customer": "C(customer_id)",
    "rep": "C(rep)",
    "year": "C(year)",
}


def nested_decomposition(
    data: pd.DataFrame,
    target: str,
    blocks: list[str],
    cluster_on: str,
    *,
    cv_folds: int = 5,
    seed: int = 42,
    in_sample_only_f_p: float = 0.001,
    in_sample_only_cv_increment: float = 0.02,
) -> pd.DataFrame:
    """Cumulative decomposition table, one row per block (§5.2).

    Columns: block, r2, r2_adj, r2_cv, n_params, adj_increment,
    cv_increment, f_p_vs_prev, in_sample_only. `in_sample_only` marks
    blocks that pass the F-test but add < the config CV-R² increment:
    statistically present, predictively useless (§2.4).
    """
    unknown = [b for b in blocks if b not in BLOCK_TERMS]
    if unknown:
        raise KeyError(f"unknown decomposition blocks: {unknown}")

    rows: list[dict[str, Any]] = []
    prev_fit: Any = None
    prev_report: ModelReport | None = None
    terms: list[str] = []
    for block in blocks:
        terms.append(BLOCK_TERMS[block])
        formula = f"{target} ~ " + " + ".join(terms)
        fit, report = fit_reported(
            formula, data, cluster_on=cluster_on, cv_folds=cv_folds, seed=seed
        )
        if prev_fit is None:
            f_p = float("nan")
            adj_inc = report.r2_adj
            cv_inc = report.r2_cv
        else:
            assert prev_report is not None
            _, f_p = nested_f_test(prev_fit, fit)
            adj_inc = report.r2_adj - prev_report.r2_adj
            cv_inc = report.r2_cv - prev_report.r2_cv
        in_sample_only = bool(
            f_p == f_p  # not NaN
            and f_p < in_sample_only_f_p
            and cv_inc < in_sample_only_cv_increment
        )
        rows.append(
            {
                "block": block,
                "r2": report.r2,
                "r2_adj": report.r2_adj,
                "r2_cv": report.r2_cv,
                "n_params": report.n_params,
                "adj_increment": adj_inc,
                "cv_increment": cv_inc,
                "f_p_vs_prev": f_p,
                "in_sample_only": in_sample_only,
                "formula": formula,
            }
        )
        prev_fit, prev_report = fit, report
    return pd.DataFrame(rows)


def rep_naive_vs_controlled(
    data: pd.DataFrame,
    target: str,
    *,
    cv_folds: int = 5,
    seed: int = 42,
) -> dict[str, Any]:
    """The §12 rep-confounding pair: what a rep dashboard would show
    (naive) vs what survives controls (rep block added last).

    Naive: target ~ C(rep) alone. Controlled: rep's nested-F p and CV-R²
    increment on top of size + run features + product + customer + year.
    The gap between the two is the finding.
    """
    naive_fit, naive_report = fit_reported(
        f"{target} ~ C(rep)", data, cluster_on="customer_id", cv_folds=cv_folds, seed=seed
    )
    base_terms = [BLOCK_TERMS[b] for b in ("size", "run_features", "product", "customer", "year")]
    base_formula = f"{target} ~ " + " + ".join(base_terms)
    full_formula = base_formula + " + C(rep)"
    base_fit, base_report = fit_reported(
        base_formula, data, cluster_on="customer_id", cv_folds=cv_folds, seed=seed
    )
    full_fit, full_report = fit_reported(
        full_formula, data, cluster_on="customer_id", cv_folds=cv_folds, seed=seed
    )
    f_stat, f_p = nested_f_test(base_fit, full_fit)
    return {
        "naive": naive_report,
        "controlled_f_stat": f_stat,
        "controlled_f_p": f_p,
        "controlled_cv_increment": full_report.r2_cv - base_report.r2_cv,
        "controlled_adj_increment": full_report.r2_adj - base_report.r2_adj,
    }
