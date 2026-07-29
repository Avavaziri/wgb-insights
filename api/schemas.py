"""Pydantic response models mirroring stats_core dataclasses 1:1 (§7.1).

Every field is required (no defaults on report models), so no bare
number can cross the API boundary — the server refuses to serialise it.
Findings excluded in §1 are structurally marked: `caution`,
`inconclusive` and `not_headline` wrappers, which the frontend must
render visibly.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ModelReportSchema(Strict):
    r2: float
    r2_adj: float
    r2_cv: float
    cv_folds: int
    n_params: int
    n_obs: int
    n_clusters: int | None
    formula: str


class EffectReportSchema(Strict):
    name: str
    coef: float
    pct_effect: float | None
    ci_low: float
    ci_high: float
    p_value: float
    p_value_adj: float | None
    n_obs: int
    n_clusters: int | None
    se_type: str


class ValidationReportSchema(Strict):
    source_name: str
    n_rows: int
    n_customers: int
    n_reps: int
    salesin_min: str
    salesin_max: str
    identity1_max_err: float
    identity2_max_err: float
    identity2_ok: bool
    va_pct_error_cells: int
    n_negative_sell_price: int
    n_null_salesout: int
    n_null_shipdate: int
    n_null_binding: int
    n_press_hrs_zero: int
    n_null_manadj: int
    n_null_purchases: int
    n_null_product: int
    n_identity2_checked: int
    schema_ok: bool


class CleanReportSchema(Strict):
    n_clean_rows: int
    n_quarantined_credits: int
    n_va_pct_coerced: int
    n_binding_recoded: int
    n_fx_converted: int
    n_dwell_outliers: int
    n_product_collapsed: int
    n_partial_period: int
    partial_year: int | None
    as_of: str


class GapSchema(Strict):
    gap: str
    blocks: str
    would_enable: str


class DatasetResponse(Strict):
    """POST /datasets — the dynamic-system contract: a new file of the
    same schema refreshes every result with no code change."""

    dataset_hash: str
    validation: ValidationReportSchema
    clean_report: CleanReportSchema
    gaps: list[GapSchema]


class YearRow(Strict):
    year: int
    revenue_gbp: float
    contribution_gbp: float
    va_margin_pct: float
    jobs: int
    active_customers: int
    revenue_per_job_gbp: float


class RegisterEntry(Strict):
    id: str
    hypothesis: str
    test: str
    outcome: str
    status: str
    evidence: str


class OverviewResponse(Strict):
    source_name: str
    as_of: str
    seeds: dict[str, int]
    trend: list[YearRow]
    partial_year: int | None
    growth: dict[str, float | int]
    sample_share_of_turnover: float
    scale_caveat: str
    validation: ValidationReportSchema
    clean_report: CleanReportSchema
    gaps: list[GapSchema]
    hypothesis_register: list[RegisterEntry]


class DecompositionRow(Strict):
    block: str
    r2: float
    r2_adj: float
    r2_cv: float
    n_params: int
    adj_increment: float
    cv_increment: float
    f_p_vs_prev: float | None
    in_sample_only: bool
    formula: str


class RepPairSchema(Strict):
    naive: ModelReportSchema
    controlled_f_stat: float
    controlled_f_p: float
    controlled_cv_increment: float
    controlled_adj_increment: float
    conclusion: str


class DecompositionResponse(Strict):
    target: str
    rows: list[DecompositionRow]
    rep_pair: RepPairSchema
    order_note: str


class CautionWrapped(Strict):
    """A computed result barred from headline status. The frontend MUST
    render the banner text adjacent to the value (§7.1)."""

    caution: str
    effect: EffectReportSchema


class OverrideModelSchema(Strict):
    r2_cv_model: float
    r2_cv_baseline_zero: float
    r2_cv_baseline_customer_mean: float
    r2_cv_baseline_global_mean: float
    auc_direction: float
    n_obs: int
    n_clusters: int
    cv_folds: int
    model_family: str
    beats_all_baselines: bool
    top_features: list[str]
    finding: str


class PricingResponse(Strict):
    scale: dict[str, Any]
    model: OverrideModelSchema
    override_effect: CautionWrapped


class ThresholdsResponse(Strict):
    benchmark_rate_gbp_per_hr: float
    crossover_hrs: float
    crossover_window_range: tuple[float, float]
    crossover_ci95: tuple[float, float]
    monotonicity: dict[str, Any]
    capacity_share: dict[str, float]
    capacity_statement: str
    litho_only_note: str


class InconclusiveWrapped(Strict):
    inconclusive: str
    interaction: EffectReportSchema
    simple_slopes: list[dict[str, Any]]


class RushResponse(Strict):
    main_effect: EffectReportSchema
    bh_status: str  # 'headline' or 'not_headline' — set by the BH pass alone
    bh_note: str
    percentile_sensitivity: list[dict[str, Any]]
    interaction: InconclusiveWrapped


class ChurnRow(Strict):
    customer: str
    n_orders: int
    median_interval: float | None
    interval_cv: float | None
    gap_days: float
    gap_ratio: float | None
    forecastable: bool
    risk_band: str
    reason_code: str
    expected_next_order: str | None
    at_risk_personalised: bool


class ChurnResponse(Strict):
    as_of: str
    gate: str
    rows: list[ChurnRow]
    comparison: dict[str, Any]


class RegisterResponse(Strict):
    entries: list[RegisterEntry]
    bh_table: list[dict[str, Any]]
    currency_replication: dict[str, Any]
    rush_percentile_sensitivity: list[dict[str, Any]]
    window_sensitivity: list[dict[str, Any]]
