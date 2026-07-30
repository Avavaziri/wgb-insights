"""Yearly trend and concentration (§5.7).

Full years only for trend/YoY: the partial final period is excluded
here and flagged everywhere else (§2.8). Closed jobs only for financial
figures (§3.3 trap 8). GBP after FX throughout.

Concentration is computed here, registered as a tested negative
(Gini ≈ 0.36, top-1 ≈ 11%), and gets a README line: no app tab (§1).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def yearly_trend(data: pd.DataFrame) -> pd.DataFrame:
    """Per full year: revenue, contribution, VA%, jobs, active customers,
    revenue per job. Partial years excluded, stated by omission here and
    greyed in charts."""
    full = data[~data["is_partial_period"] & data["is_closed"]]
    g = full.groupby("year")
    out = pd.DataFrame(
        {
            "revenue_gbp": g["sell_price_gbp"].sum(),
            "contribution_gbp": g["va_amount_gbp"].sum(),
            "jobs": g.size(),
            "active_customers": g["customer_id"].nunique(),
        }
    )
    out["va_margin_pct"] = out["contribution_gbp"] / out["revenue_gbp"] * 100
    out["revenue_per_job_gbp"] = out["revenue_gbp"] / out["jobs"]
    return out


def growth_attribution(trend: pd.DataFrame) -> dict[str, Any]:
    """CAGR of revenue decomposed into volume (jobs) vs value per job.
    log CAGR(revenue) == log CAGR(jobs) + log CAGR(rev/job), exactly."""
    first, last = trend.index.min(), trend.index.max()
    years = int(last - first)
    if years < 1:
        raise ValueError("growth attribution needs at least two full years")

    def cagr(series: pd.Series) -> float:
        return float((series.loc[last] / series.loc[first]) ** (1 / years) - 1)

    return {
        "first_year": int(first),
        "last_year": int(last),
        "revenue_cagr": cagr(trend["revenue_gbp"]),
        "jobs_cagr": cagr(trend["jobs"].astype(float)),
        "revenue_per_job_cagr": cagr(trend["revenue_per_job_gbp"]),
        "va_margin_change_pts": float(
            trend["va_margin_pct"].loc[last] - trend["va_margin_pct"].loc[first]
        ),
        "customers_first": int(trend["active_customers"].loc[first]),
        "customers_last": int(trend["active_customers"].loc[last]),
    }


def gini(values: np.ndarray) -> float:
    """Gini coefficient of non-negative values (revenue concentration)."""
    v = np.sort(np.asarray(values, dtype=float))
    v = v[v >= 0]
    n = len(v)
    if n == 0 or v.sum() == 0:
        return 0.0
    cum = np.cumsum(v)
    return float((n + 1 - 2 * (cum / cum[-1]).sum()) / n)


def concentration(data: pd.DataFrame) -> dict[str, Any]:
    """Customer revenue concentration over the full period (closed jobs).
    Tested negative in the register, README line only, no app tab."""
    rev = (
        data[data["is_closed"]]
        .groupby("customer_id")["sell_price_gbp"]
        .sum()
        .sort_values(ascending=False)
    )
    total = float(rev.sum())
    shares = rev / total
    return {
        "gini": gini(rev.to_numpy()),
        "top_1_share": float(shares.iloc[:1].sum()),
        "top_3_share": float(shares.iloc[:3].sum()),
        "top_5_share": float(shares.iloc[:5].sum()),
        "top_10_share": float(shares.iloc[:10].sum()),
        "hhi": float((shares**2).sum()),
        "n_customers": int(len(rev)),
        "top_customer": str(rev.index[0]),
    }
