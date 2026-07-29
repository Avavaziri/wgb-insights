"""One entry point: file in, every module's results out.

POST /datasets, verify.py and export_assets.py all consume this bundle,
so a number can only ever be computed one way (§4: Python is the single
source of truth).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd

from src import checks
from src.churn import cadence_stats, compare_fixed_rule, risk_table
from src.clean import CleanReport, clean, constraint_frame
from src.config import load_config
from src.decomposition import nested_decomposition, rep_naive_vs_controlled
from src.ingest import ValidationReport, load_raw
from src.pricing import (
    OverrideModelReport,
    override_effect,
    override_model,
    override_scale,
)
from src.rush import percentile_sensitivity, rush_effect, rush_load_interaction
from src.stats_core import EffectReport
from src.thresholds import (
    benchmark_rate,
    capacity_share_above,
    crossover_ci,
    crossover_point,
    monotonicity_report,
    rolling_rate_curve,
    window_sensitivity,
)
from src.trend import concentration, growth_attribution, yearly_trend


@dataclass(frozen=True)
class PipelineResult:
    source_name: str
    validation: ValidationReport
    clean_report: CleanReport
    jobs: pd.DataFrame
    credits: pd.DataFrame
    constraint: pd.DataFrame
    decomposition: pd.DataFrame
    rep_pair: dict[str, Any]
    thresholds: dict[str, Any]
    pricing_scale: dict[str, Any]
    pricing_effect: EffectReport  # caution-wrapped downstream, never headline
    pricing_model: OverrideModelReport
    rush_effect: EffectReport
    rush_interaction: dict[str, Any]
    rush_sensitivity: pd.DataFrame
    churn_cadence: pd.DataFrame
    churn_risk: pd.DataFrame
    churn_comparison: dict[str, Any]
    trend_yearly: pd.DataFrame
    trend_growth: dict[str, Any]
    trend_concentration: dict[str, Any]
    currency_replication: dict[str, Any]
    bh_table: pd.DataFrame
    register: list[dict[str, Any]]
    config: dict[str, Any]


def run_pipeline(path: Path, config: dict[str, Any] | None = None) -> PipelineResult:
    """ingest → clean → every module → checks + BH + register. ~1-2 min."""
    cfg = config or load_config()
    raw, validation = load_raw(path)
    result = clean(raw, cfg)
    jobs = result.jobs
    cf = constraint_frame(jobs, cfg)

    seed = int(cfg["seeds"]["global"])
    cv_seed = int(cfg["seeds"]["cv"])
    dcfg, tcfg, rcfg, ccfg = (
        cfg["decomposition"], cfg["thresholds"], cfg["rush"], cfg["churn"]
    )

    decomp = nested_decomposition(
        cf, "log_rate", dcfg["blocks"], cluster_on="customer_id",
        cv_folds=int(dcfg["cv_folds"]), seed=cv_seed,
        in_sample_only_f_p=float(dcfg["in_sample_only_f_p"]),
        in_sample_only_cv_increment=float(dcfg["in_sample_only_cv_increment"]),
    )
    rep_pair = rep_naive_vs_controlled(cf, "log_rate", seed=cv_seed)

    window, step = int(tcfg["rolling_window"]), int(tcfg["rolling_step"])
    curve = rolling_rate_curve(cf, window, step)
    bench = benchmark_rate(cf)
    xover = crossover_point(curve, bench)
    ci = crossover_ci(
        cf, n_boot=int(tcfg["n_boot"]), seed=int(cfg["seeds"]["bootstrap"]),
        window=window, step=step,
    )
    sens = window_sensitivity(cf, [int(w) for w in tcfg["window_sensitivity"]], step=step)
    thresholds = {
        "benchmark_rate": bench,
        "curve": curve,
        "crossover_hrs": xover,
        "crossover_ci": ci,
        "window_sensitivity": sens,
        "monotonicity": monotonicity_report(cf, window=window, step=step),
        "capacity_share": capacity_share_above(cf, xover),
    }

    tol = float(cfg["clean"]["override_tolerance_gbp"])
    scale = override_scale(cf, tol)
    ov_effect = override_effect(cf, tol, seed=cv_seed)
    ov_model = override_model(cf, cfg, seed=seed)

    pct, bands, nbins = (
        float(rcfg["dwell_percentile"]), int(rcfg["size_bands"]), int(rcfg["load_bins"])
    )
    r_effect = rush_effect(cf, pct, bands, seed=cv_seed)
    r_inter = rush_load_interaction(cf, pct, bands, nbins, seed=cv_seed)
    r_sens = percentile_sensitivity(
        cf, [float(p) for p in rcfg["percentile_sensitivity"]], bands, seed=cv_seed
    )

    mult, cv_max, min_orders, fixed_days = (
        float(ccfg["gap_multiplier"]), float(ccfg["cv_max"]),
        int(ccfg["min_orders"]), int(ccfg["fixed_rule_days"]),
    )
    cadence = cadence_stats(jobs)
    risk = risk_table(jobs, mult, cv_max, min_orders)
    comparison = compare_fixed_rule(jobs, fixed_days, mult, cv_max, min_orders)

    trend = yearly_trend(jobs)
    growth = growth_attribution(trend)
    conc = concentration(jobs)

    fx_check = checks.currency_replication(cf)
    bh_table, ov_effect, r_effect, interaction_rep = checks.bh_pass(
        cfg, decomp.set_index("block"), cf, ov_effect, r_effect,
        r_inter["interaction"], seed=cv_seed,
    )
    r_inter = {**r_inter, "interaction": interaction_rep}

    register = checks.attach_register(
        decomposition=decomp.set_index("block"),
        bh_table=bh_table,
        monotonicity=thresholds["monotonicity"],
        pricing_scale=scale,
        pricing_model=ov_model,
        rush_effect_report=r_effect,
        interaction_report=interaction_rep,
        concentration_stats=conc,
        cadence=cadence,
        churn_config=ccfg,
        growth=growth,
    )

    return PipelineResult(
        source_name=path.name,
        validation=validation,
        clean_report=result.report,
        jobs=jobs,
        credits=result.credits,
        constraint=cf,
        decomposition=decomp,
        rep_pair=rep_pair,
        thresholds=thresholds,
        pricing_scale=scale,
        pricing_effect=ov_effect,
        pricing_model=ov_model,
        rush_effect=r_effect,
        rush_interaction=r_inter,
        rush_sensitivity=r_sens,
        churn_cadence=cadence,
        churn_risk=risk,
        churn_comparison=comparison,
        trend_yearly=trend,
        trend_growth=growth,
        trend_concentration=conc,
        currency_replication=fx_check,
        bh_table=bh_table,
        register=register,
        config=cfg,
    )
