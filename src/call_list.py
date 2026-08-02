"""The ranked retention call list (§7.2): the churn module's actionable output.

One row per customer: cadence, gate status, risk, value context (historic
contribution, contribution per constraint-hour, override rate), and
expected_next_order (null where not forecastable: never invented).
"""

from __future__ import annotations

import pandas as pd

from src.pricing import override_flags

CALL_LIST_COLUMNS = [
    "customer", "rep", "industry", "last_order", "days_since",
    "own_median_interval", "interval_cv", "forecastable", "gap_ratio",
    "historic_contribution_gbp", "contribution_per_constraint_hr",
    "override_rate", "risk_band", "reason_code", "expected_next_order",
]

_RISK_ORDER = {"high": 0, "elevated": 1, "watch (irregular)": 2, "normal": 3}


def build_call_list(
    jobs: pd.DataFrame, risk: pd.DataFrame, tolerance_gbp: float
) -> pd.DataFrame:
    """Join the risk table with per-customer value context, ranked by risk
    band then historic contribution (call the valuable ones first)."""
    flags = override_flags(jobs, tolerance_gbp)
    by_cust = jobs.assign(overridden=flags["overridden"]).groupby("customer_id")

    context = pd.DataFrame(
        {
            "rep": by_cust["rep"].agg(lambda s: s.mode().iat[0]),
            "industry": by_cust["industry"].agg(lambda s: s.mode().iat[0]),
            "historic_contribution_gbp": by_cust["va_amount_gbp"].sum().round(0),
            "override_rate": by_cust["overridden"].mean().round(3),
        }
    )
    hours = by_cust["press_hrs"].sum()
    contribution_on_press = jobs[jobs["press_hrs"] > 0].groupby("customer_id")[
        "va_amount_gbp"
    ].sum()
    context["contribution_per_constraint_hr"] = (
        (contribution_on_press / hours).where(hours > 0).round(0)
    )

    out = risk.join(context)
    out = out.reset_index().rename(
        columns={
            "customer_id": "customer",
            "gap_days": "days_since",
            "median_interval": "own_median_interval",
            "cv": "interval_cv",
        }
    )
    out["_rank"] = out["risk_band"].map(_RISK_ORDER)
    out = out.sort_values(
        ["_rank", "historic_contribution_gbp"], ascending=[True, False]
    )
    return out[CALL_LIST_COLUMNS].reset_index(drop=True)
