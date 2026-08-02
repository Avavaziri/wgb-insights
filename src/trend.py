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


def customer_value(data: pd.DataFrame, top_n: int = 10) -> pd.DataFrame:
    """Most valuable customers, ranked by total contribution (GBP).

    Descriptive only: closed jobs over the whole period, no modelling.
    `contribution_per_press_hr` is contribution on the customer's Litho
    press jobs divided by their press hours (NaN where they have none),
    matching the call list's definition. Contribution here is sell price
    net of purchases: it flatters small jobs because no cost-to-serve
    exists in the data, and every share is a share of THIS SAMPLE, not of
    company turnover.
    """
    closed = data[data["is_closed"]]
    g = closed.groupby("customer_id")
    out = pd.DataFrame(
        {
            "rep": g["rep"].agg(lambda s: s.mode().iat[0]),
            "industry": g["industry"].agg(lambda s: s.mode().iat[0]),
            "jobs": g.size(),
            "revenue_gbp": g["sell_price_gbp"].sum(),
            "contribution_gbp": g["va_amount_gbp"].sum(),
        }
    )
    out["share_of_contribution"] = (
        out["contribution_gbp"] / out["contribution_gbp"].sum()
    )
    hours = g["press_hrs"].sum()
    on_press = (
        closed[closed["press_hrs"] > 0]
        .groupby("customer_id")["va_amount_gbp"]
        .sum()
    )
    out["contribution_per_press_hr"] = (on_press / hours).where(hours > 0)
    out = out.sort_values("contribution_gbp", ascending=False)
    return out.head(top_n).reset_index().rename(columns={"customer_id": "name"})


def work_type_value(data: pd.DataFrame, min_jobs: int = 15) -> pd.DataFrame:
    """Most valuable types of work, ranked by total contribution (GBP).

    "Type of work" here is the canonicalised product type; categories
    under `min_jobs` jobs roll into "Other (long tail)" so the table stays
    readable without hiding volume. Same caveats as customer_value, and
    `contribution_per_press_hr` only exists where the category has Litho
    press hours.
    """
    closed = data[data["is_closed"]].copy()
    counts = closed["product_type"].value_counts()
    small = counts[counts < min_jobs].index
    closed["product_group"] = closed["product_type"].where(
        ~closed["product_type"].isin(small), "Other (long tail)"
    )
    g = closed.groupby("product_group")
    out = pd.DataFrame(
        {
            "jobs": g.size(),
            "revenue_gbp": g["sell_price_gbp"].sum(),
            "contribution_gbp": g["va_amount_gbp"].sum(),
        }
    )
    out["share_of_contribution"] = (
        out["contribution_gbp"] / out["contribution_gbp"].sum()
    )
    out["va_margin_pct"] = out["contribution_gbp"] / out["revenue_gbp"] * 100
    hours = g["press_hrs"].sum()
    on_press = (
        closed[closed["press_hrs"] > 0]
        .groupby("product_group")["va_amount_gbp"]
        .sum()
    )
    out["contribution_per_press_hr"] = (on_press / hours).where(hours > 0)
    out = out.sort_values("contribution_gbp", ascending=False)
    return out.reset_index().rename(columns={"product_group": "name"})


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
