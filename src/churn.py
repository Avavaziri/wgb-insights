"""Reorder cadence and retention risk (§5.6).

No ML here — n=50 customers; transparent rules, defended not apologised
for. The regularity gate is mandatory: most reorder timing is
near-random, and predicting a next-order date for an irregular account
is noise dressed as insight. Non-forecastable accounts still get a risk
band, with the exclusion reason shown.

`as_of` always derives from max(SalesIn) — never datetime.now() (§10):
analyses must reproduce identically on the same file forever.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def cadence_stats(data: pd.DataFrame, as_of: pd.Timestamp | None = None) -> pd.DataFrame:
    """Per-customer cadence on DISTINCT order dates (multi-line orders on
    one day are one ordering event). Columns: n_orders, median_interval,
    iqr, cv, last_order, gap_days, gap_ratio."""
    if as_of is None:
        as_of = data["sales_in"].max()
    rows: list[dict[str, Any]] = []
    for cust, grp in data.groupby("customer_id"):
        dates = pd.Series(sorted(grp["sales_in"].dt.normalize().unique()))
        intervals = dates.diff().dt.days.dropna()
        last = dates.iloc[-1]
        gap = float((as_of - last).days)
        if len(intervals) >= 1:
            median = float(intervals.median())
            iqr = float(intervals.quantile(0.75) - intervals.quantile(0.25))
            cv = float(intervals.std(ddof=1) / intervals.mean()) if len(intervals) >= 2 else np.nan
        else:
            median = iqr = cv = float("nan")
        rows.append(
            {
                "customer_id": cust,
                "n_orders": int(len(dates)),
                "median_interval": median,
                "iqr": iqr,
                "cv": cv,
                "last_order": last,
                "gap_days": gap,
                "gap_ratio": gap / median if median and median > 0 else float("nan"),
            }
        )
    return pd.DataFrame(rows).set_index("customer_id")


def regularity_gate(cadence: pd.DataFrame, cv_max: float, min_orders: int) -> pd.Series:
    """Forecastable = enough distinct orders AND interval CV below the
    config gate. Everything else gets no predicted date, with a reason."""
    return (cadence["n_orders"] >= min_orders) & (cadence["cv"] < cv_max)


def risk_table(
    data: pd.DataFrame,
    multiplier: float,
    cv_max: float,
    min_orders: int,
    as_of: pd.Timestamp | None = None,
) -> pd.DataFrame:
    """Cadence + gate + risk band + reason codes + expected_next_order
    (null where not forecastable — never invented)."""
    cadence = cadence_stats(data, as_of=as_of)
    forecastable = regularity_gate(cadence, cv_max, min_orders)
    out = cadence.copy()
    out["forecastable"] = forecastable
    out["reason_code"] = np.select(
        [
            cadence["n_orders"] < min_orders,
            ~forecastable,
            forecastable & (cadence["gap_ratio"] > multiplier),
        ],
        ["too_few_orders", "irregular_cadence", "overdue_vs_own_cadence"],
        default="within_own_cadence",
    )
    out["risk_band"] = np.select(
        [
            forecastable & (cadence["gap_ratio"] > 2 * multiplier),
            forecastable & (cadence["gap_ratio"] > multiplier),
            ~forecastable & (cadence["gap_ratio"] > 2 * multiplier),
        ],
        ["high", "elevated", "watch (irregular)"],
        default="normal",
    )
    expected = cadence["last_order"] + pd.to_timedelta(cadence["median_interval"], unit="D")
    out["expected_next_order"] = expected.where(forecastable)
    out["at_risk_personalised"] = personalised_at_risk(cadence, multiplier)
    return out


def personalised_at_risk(cadence: pd.DataFrame, multiplier: float) -> pd.Series:
    """Variability-aware personalised flag: silent longer than your own
    median interval plus `multiplier` times your own spread —
    gap > median × (1 + multiplier × CV).

    A steady 30-day account is flagged weeks before a fixed 90-day rule
    notices; an erratic account isn't flagged for noise a fixed rule
    would panic over. Applies to every account with cadence stats (the
    regularity gate governs next-order *prediction*, not risk flagging).
    """
    threshold = cadence["median_interval"] * (1 + multiplier * cadence["cv"])
    return (cadence["gap_days"] > threshold).fillna(False)


def compare_fixed_rule(
    data: pd.DataFrame,
    fixed_days: int,
    multiplier: float,
    cv_max: float,
    min_orders: int,
    as_of: pd.Timestamp | None = None,
) -> dict[str, Any]:
    """Fixed N-day rule vs personalised thresholds: counts AND the set
    difference — the point is they flag DIFFERENT accounts (§1)."""
    table = risk_table(data, multiplier, cv_max, min_orders, as_of=as_of)
    fixed = set(table.index[table["gap_days"] > fixed_days])
    personalised = set(table.index[personalised_at_risk(table, multiplier)])
    return {
        "fixed_days": fixed_days,
        "n_fixed": len(fixed),
        "n_personalised": len(personalised),
        "only_fixed": sorted(fixed - personalised),
        "only_personalised": sorted(personalised - fixed),
        "both": sorted(fixed & personalised),
        "sets_differ": fixed != personalised,
    }
