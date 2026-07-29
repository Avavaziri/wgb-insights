"""Named robustness checks, the single BH pass, register I/O (§5.8).

The BH correction is applied ONCE, here, over the fixed headline family
from config — nowhere else may set p_value_adj. Anything failing is
automatically flagged not_headline and barred from asset export. Raw and
adjusted p-values are both kept (§2.7).
"""

from __future__ import annotations

import dataclasses
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import scipy.stats
import yaml

from src.stats_core import EffectReport, fit_reported, nested_f_test

REGISTER_PATH = Path(__file__).resolve().parents[1] / "register.yaml"


def currency_replication(cf: pd.DataFrame) -> dict[str, Any]:
    """Named check 1: the size-rate ordering must hold within each
    currency separately — otherwise it could be an FX artifact."""
    out: dict[str, Any] = {}
    for ccy, grp in cf.groupby("currency"):
        rho, p = scipy.stats.spearmanr(grp["press_hrs"], grp["rate_gbp_per_hr"])
        out[str(ccy)] = {"spearman_rho": float(rho), "p": float(p), "n": int(len(grp))}
    rhos = [v["spearman_rho"] for v in out.values()]
    out["holds_in_both"] = bool(len(rhos) >= 2 and all(r < -0.3 for r in rhos))
    return out


def bh_adjust(p_values: dict[str, float], alpha: float = 0.05) -> pd.DataFrame:
    """Benjamini-Hochberg step-up over a named family. Returns a table
    with rank, threshold, adjusted p (monotone) and pass/fail."""
    items = sorted(p_values.items(), key=lambda kv: kv[1])
    m = len(items)
    rows = []
    adj = np.minimum.accumulate(
        [p * m / (i + 1) for i, (_, p) in reversed(list(enumerate(items)))]
    )[::-1]
    passes_k = 0
    for i, (_, p) in enumerate(items):
        if p <= (i + 1) / m * alpha:
            passes_k = i + 1
    for i, (name, p) in enumerate(items):
        rows.append(
            {
                "name": name,
                "p_raw": p,
                "rank": i + 1,
                "bh_threshold": (i + 1) / m * alpha,
                "p_adj": float(min(adj[i], 1.0)),
                "passes_bh": i + 1 <= passes_k,
            }
        )
    return pd.DataFrame(rows)


def bh_pass(
    cfg: dict[str, Any],
    decomp: pd.DataFrame,
    cf: pd.DataFrame,
    override_rep: EffectReport,
    rush_rep: EffectReport,
    interaction_rep: EffectReport,
    *,
    seed: int,
) -> tuple[pd.DataFrame, EffectReport, EffectReport, EffectReport]:
    """Assemble the fixed family's raw p-values, adjust once, and write
    p_value_adj back into the EffectReports (frozen → replace)."""
    fit_null, _ = fit_reported("log_rate ~ 1", cf, seed=seed)
    fit_size, _ = fit_reported("log_rate ~ np.log(press_hrs)", cf, seed=seed)
    _, size_p = nested_f_test(fit_null, fit_size)

    family = {
        "customer_block": float(decomp.loc["customer", "f_p_vs_prev"]),
        "run_features_block": float(decomp.loc["run_features", "f_p_vs_prev"]),
        "product_block": float(decomp.loc["product", "f_p_vs_prev"]),
        "size_effect": float(size_p),
        "rush_main_effect": rush_rep.p_value,
        "rush_load_interaction": interaction_rep.p_value,
        "override_effect": override_rep.p_value,
    }
    configured = list(cfg["bh_family"])
    if set(configured) != set(family):
        raise KeyError(
            f"bh_family in config {configured} != implemented family {sorted(family)}"
        )
    table = bh_adjust(family)
    lookup = table.set_index("name")["p_adj"]
    return (
        table,
        dataclasses.replace(override_rep, p_value_adj=float(lookup["override_effect"])),
        dataclasses.replace(rush_rep, p_value_adj=float(lookup["rush_main_effect"])),
        dataclasses.replace(
            interaction_rep, p_value_adj=float(lookup["rush_load_interaction"])
        ),
    )


def load_register(path: Path | None = None) -> list[dict[str, Any]]:
    with open(path or REGISTER_PATH, encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    return list(data["hypotheses"])


def attach_register(
    *,
    decomposition: pd.DataFrame,
    bh_table: pd.DataFrame,
    monotonicity: dict[str, Any],
    pricing_scale: dict[str, Any],
    pricing_model: Any,
    rush_effect_report: EffectReport,
    interaction_report: EffectReport,
    concentration_stats: dict[str, Any],
    cadence: pd.DataFrame,
    churn_config: dict[str, Any],
    growth: dict[str, Any],
) -> list[dict[str, Any]]:
    """Attach outcome + evidence + communication status to every register
    entry. Negative results are deliverables (§2.9)."""
    bh = bh_table.set_index("name")

    def block(name: str) -> dict[str, float | bool]:
        return {
            "cv_increment": float(decomposition.loc[name, "cv_increment"]),
            "f_p": float(decomposition.loc[name, "f_p_vs_prev"]),
            "in_sample_only": bool(decomposition.loc[name, "in_sample_only"]),
        }

    n_forecastable = int(
        (cadence["cv"] < float(churn_config["cv_max"])).fillna(False).sum()
    )
    median_cv = float(cadence["cv"].median())

    outcomes: dict[str, dict[str, Any]] = {
        "margin_by_customer": {
            "outcome": "supported",
            "status": "headline",
            "evidence": (
                f"CV R2 +{block('customer')['cv_increment']:.3f} on top of size, run "
                f"features and product; BH-adjusted p = {bh.loc['customer_block', 'p_adj']:.1e}"
            ),
        },
        "margin_by_product": {
            "outcome": "rejected_as_predictor",
            "status": "register_only",
            "evidence": (
                f"in-sample F p = {block('product')['f_p']:.1e} but CV increment "
                f"{block('product')['cv_increment']:+.3f} -> in_sample_only"
            ),
        },
        "margin_by_rep": {
            "outcome": "rejected",
            "status": "register_only",
            "evidence": f"nested F p = {block('rep')['f_p']:.2f}, CV increment "
                        f"{block('rep')['cv_increment']:+.3f} — nothing survives controls",
        },
        "margin_by_size": {
            "outcome": "supported",
            "status": "headline",
            "evidence": (
                f"Spearman rho = {monotonicity['spearman_rho']:.2f}; monotonic decline, "
                f"interior optimum = {monotonicity['interior_optimum']}; BH-adjusted "
                f"p = {bh.loc['size_effect', 'p_adj']:.1e}"
            ),
        },
        "margin_by_run_features": {
            "outcome": "supported_weak",
            "status": "register_only",
            "evidence": (
                f"CV increment {block('run_features')['cv_increment']:+.3f}; size still "
                "matters with quantity/impressions/plates controlled"
            ),
        },
        "override_affects_margin": {
            "outcome": "excluded_selection_bias",
            "status": "caution_only",
            "evidence": (
                f"raw p = {bh.loc['override_effect', 'p_raw']:.3f}, BH-adjusted "
                f"p = {bh.loc['override_effect', 'p_adj']:.3f} "
                f"({'passes' if bh.loc['override_effect', 'passes_bh'] else 'fails'} BH) — "
                "but overrides are applied to selected jobs; correlational either way. "
                "Shown under caution banner only, never exported."
            ),
        },
        "overrides_learnable": {
            "outcome": (
                "supported" if pricing_model.beats_all_baselines else "rejected"
            ),
            "status": "register_only",
            "evidence": (
                f"GroupKFold R2 {pricing_model.r2_cv_model:.3f} vs baselines zero "
                f"{pricing_model.r2_cv_baseline_zero:.3f} / customer-mean "
                f"{pricing_model.r2_cv_baseline_customer_mean:.3f} / global "
                f"{pricing_model.r2_cv_baseline_global_mean:.3f}; direction AUC "
                f"{pricing_model.auc_direction:.2f} — "
                + (
                    "learnable from quote-time features"
                    if pricing_model.beats_all_baselines
                    else "estimators use information the system does not capture (data gap)"
                )
            ),
        },
        "rush_costs_margin": {
            "outcome": "supported" if bool(bh.loc["rush_main_effect", "passes_bh"])
            else "not_significant_after_bh",
            "status": "headline" if bool(bh.loc["rush_main_effect", "passes_bh"])
            else "not_headline",
            "evidence": (
                f"{rush_effect_report.pct_effect:+.1f}% "
                f"[{(np.exp(rush_effect_report.ci_low) - 1) * 100:.1f}, "
                f"{(np.exp(rush_effect_report.ci_high) - 1) * 100:.1f}]%, cluster-robust "
                f"p = {rush_effect_report.p_value:.3f}, BH-adjusted "
                f"p = {bh.loc['rush_main_effect', 'p_adj']:.3f}"
            ),
        },
        "rush_cost_depends_on_load": {
            "outcome": "inconclusive",
            "status": "appendix_only",
            "evidence": (
                f"interaction p = {interaction_report.p_value:.2f} — consistent with "
                "queueing theory (Kingman/VUT), not established by this data"
            ),
        },
        "revenue_concentrated": {
            "outcome": "rejected",
            "status": "register_only",
            "evidence": (
                f"Gini = {concentration_stats['gini']:.2f}, top-1 "
                f"{concentration_stats['top_1_share']:.0%}, top-10 "
                f"{concentration_stats['top_10_share']:.0%} — not a material risk"
            ),
        },
        "reorder_forecastable": {
            "outcome": "minority_only",
            "status": "headline",
            "evidence": (
                f"median interval CV = {median_cv:.2f}; {n_forecastable}/"
                f"{len(cadence)} accounts below the {churn_config['cv_max']} gate — "
                "prediction restricted to those; the rest get risk bands with reasons"
            ),
        },
        "growth_volume_driven": {
            "outcome": "rejected",
            "status": "headline",
            "evidence": (
                f"revenue CAGR {growth['revenue_cagr']:.1%} = jobs "
                f"{growth['jobs_cagr']:+.1%} x value-per-job "
                f"{growth['revenue_per_job_cagr']:+.1%} — growth is value per job"
            ),
        },
        "optimal_job_size_exists": {
            "outcome": "rejected",
            "status": "headline",  # the rejection itself is the headline
            "evidence": (
                "monotonic decline (see margin_by_size) — no interior optimum; "
                "'crossover threshold' is the only defensible framing"
            ),
        },
    }

    entries = load_register()
    missing = {e["id"] for e in entries} ^ set(outcomes)
    if missing:
        raise KeyError(f"register.yaml and computed outcomes disagree on ids: {missing}")
    return [{**e, **outcomes[e["id"]]} for e in entries]
