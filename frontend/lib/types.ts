// Mirrors of the API schemas: types only, no logic (§4: a number
// recomputed in TS is a defect).

export interface EffectReport {
  name: string;
  coef: number;
  pct_effect: number | null;
  ci_low: number;
  ci_high: number;
  ci_low_pct: number | null;
  ci_high_pct: number | null;
  p_value: number;
  p_value_adj: number | null;
  n_obs: number;
  n_clusters: number | null;
  se_type: string;
}

export interface ModelReport {
  r2: number;
  r2_adj: number;
  r2_cv: number;
  cv_folds: number;
  n_params: number;
  n_obs: number;
  n_clusters: number | null;
  formula: string;
}

export interface RegisterEntry {
  id: string;
  hypothesis: string;
  test: string;
  outcome: string;
  status: string;
  evidence: string;
}

export interface Gap {
  gap: string;
  blocks: string;
  would_enable: string;
}

export interface Overview {
  source_name: string;
  as_of: string;
  seeds: Record<string, number>;
  trend: {
    year: number;
    revenue_gbp: number;
    contribution_gbp: number;
    va_margin_pct: number;
    jobs: number;
    active_customers: number;
    revenue_per_job_gbp: number;
  }[];
  partial_year: number | null;
  growth: Record<string, number>;
  sample_share_of_turnover: number;
  scale_caveat: string;
  validation: Record<string, number | string | boolean>;
  clean_report: Record<string, number | string | null>;
  gaps: Gap[];
  hypothesis_register: RegisterEntry[];
}

export interface Decomposition {
  target: string;
  rows: {
    block: string;
    r2: number;
    r2_adj: number;
    r2_cv: number;
    n_params: number;
    adj_increment: number;
    cv_increment: number;
    f_p_vs_prev: number | null;
    in_sample_only: boolean;
    formula: string;
  }[];
  rep_pair: {
    naive: ModelReport;
    controlled_f_stat: number;
    controlled_f_p: number;
    controlled_cv_increment: number;
    controlled_adj_increment: number;
    conclusion: string;
  };
  order_note: string;
}

export interface Pricing {
  scale: {
    override_rate: number;
    n_up: number;
    n_down: number;
    n_unknown_manadj: number;
    net_gbp_per_year: number;
    gross_gbp_per_year: number;
    rate_by_tolerance_gbp: Record<string, number>;
    tolerance_gbp: number;
    span_years: number;
  } & Record<string, unknown>;
  model: {
    r2_cv_model: number;
    r2_cv_baseline_zero: number;
    r2_cv_baseline_customer_mean: number;
    r2_cv_baseline_global_mean: number;
    auc_direction: number;
    n_obs: number;
    n_clusters: number;
    cv_folds: number;
    model_family: string;
    beats_all_baselines: boolean;
    top_features: string[];
    finding: string;
  };
  override_effect: { caution: string; effect: EffectReport };
}

export interface Thresholds {
  benchmark_rate_gbp_per_hr: number;
  // The rate curve does not always cross the benchmark: on an extract
  // where it stays on one side, the pipeline reports NaN and the wire
  // carries null. Everything keyed off the crossover must handle that.
  crossover_hrs: number | null;
  // The window range and bootstrap CI ride with the point estimate:
  // null alongside crossover_hrs when nothing crosses.
  crossover_window_range: [number, number] | null;
  crossover_ci95: [number, number] | null;
  within_customer_size: EffectReport;
  within_customer_pct_per_doubling: number;
  pooled_size: EffectReport;
  pooled_pct_per_doubling: number;
  share_range_across_crossover_ci: [number, number] | null;
  within_customer_statement: string;
  size_mix_statement: string;
  monotonicity: Record<string, number | boolean>;
  // share_of_constraint_hours / pooled_rate_above are null when there is
  // no crossover to split capacity at (same extract condition as above).
  capacity_share: Record<string, number | null>;
  capacity_statement: string;
  litho_only_note: string;
}

export interface Rush {
  main_effect: EffectReport;
  bh_status: "headline" | "not_headline";
  bh_note: string;
  percentile_sensitivity: {
    percentile: number;
    pct_effect: number;
    ci_low_pct: number | null;
    ci_high_pct: number | null;
    p_value: number;
    n_rush: number;
  }[];
  interaction: {
    inconclusive: string;
    interaction: EffectReport;
    simple_slopes: Record<string, number>[];
  };
}

export interface ValueRow {
  name: string;
  jobs: number;
  revenue_gbp: number;
  contribution_gbp: number;
  share_of_contribution: number;
  contribution_per_press_hr: number | null;
}

export interface CustomerValueRow extends ValueRow {
  rep: string;
  industry: string;
}

export interface Value {
  as_of: string;
  top_customers: CustomerValueRow[];
  work_types: ValueRow[];
  caveat: string;
  litho_note: string;
}

export interface CallListRow {
  customer: string;
  rep: string;
  industry: string;
  last_order: string;
  days_since: number;
  own_median_interval: number | null;
  interval_cv: number | null;
  forecastable: boolean;
  gap_ratio: number | null;
  historic_contribution_gbp: number;
  contribution_per_constraint_hr: number | null;
  override_rate: number;
  risk_band: string;
  reason_code: string;
  expected_next_order: string | null;
}

export interface CallList {
  as_of: string;
  rows: CallListRow[];
}

export interface Churn {
  as_of: string;
  gate: string;
  rows: {
    customer: string;
    n_orders: number;
    median_interval: number | null;
    interval_cv: number | null;
    gap_days: number;
    gap_ratio: number | null;
    forecastable: boolean;
    risk_band: string;
    reason_code: string;
    expected_next_order: string | null;
    at_risk_personalised: boolean;
  }[];
  comparison: {
    fixed_days: number;
    n_fixed: number;
    n_personalised: number;
    only_fixed: string[];
    only_personalised: string[];
    both: string[];
    sets_differ: boolean;
  };
  backtest: {
    holdout_days: number;
    cutoff: string;
    fixed_days: number;
    n_accounts: number;
    n_went_quiet: number;
    went_quiet: string[];
    personalised: BacktestScore;
    fixed: BacktestScore;
  };
}

export interface BacktestScore {
  n_flagged: number;
  n_caught: number;
  precision: number | null;
  recall: number | null;
}
