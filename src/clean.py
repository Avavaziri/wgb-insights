"""Cleaning: FX to GBP, canonicalisation, quarantine, derived fields.

Output frame is snake_case with `Puchases` renamed to `purchases` (only
here, ingest reads the misspelling as-is). Money columns get `_gbp`
twins; analysis uses only the `_gbp` columns. FX keys off `Currency`,
never `Region`: Ireland has Stg jobs and NI has Euro jobs (§3.3 trap 1).

Conversion: gbp = home_amount / eur_per_gbp for Euro rows (monthly rate
from config, default otherwise); Stg rows pass through unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

OUTSOURCED_BINDING = "Outsourced binding"  # null Binding Type is data, not absence

MONEY_COLUMNS = [  # home-currency £/€ per job; each gets a _gbp twin
    "sell_price", "va_amount", "purchases", "handling", "labour", "paper",
    "labmup", "manadj", "mupnett", "rebate", "amt_inv",
]

RENAME = {
    "Title": "title", "CustomerID": "customer_id", "Job Status": "job_status",
    "SalesIn": "sales_in", "Year": "year", "Month": "month", "Week No": "week_no",
    "SalesOut": "sales_out", "Quantity": "quantity", "Sell Price": "sell_price",
    "Mup%": "mup_pct", "VA Amount": "va_amount", "VA/24": "va_24", "VA%": "va_pct",
    "VA/K": "va_k", "Rebate": "rebate", "Puchases": "purchases",  # rename only here
    "Press hrs": "press_hrs", "Impressions": "impressions", "Handling": "handling",
    "Labour": "labour", "Paper": "paper", "labmup": "labmup", "manadj": "manadj",
    "mupnett": "mupnett", "Plates": "plates", "AmtInv": "amt_inv",
    "Customer Name": "customer_name", "Rep": "rep", "Region": "region",
    "Industry": "industry", "Work Type": "work_type", "Product Type": "product_type_raw",
    "Binding Type": "binding_type", "Currency": "currency", "Ship date": "ship_date",
}


@dataclass(frozen=True)
class CleanReport:
    """Counts for every §3.3 trap handled: nothing dropped silently."""

    n_clean_rows: int
    n_quarantined_credits: int  # Sell Price <= 0, kept in a separate frame
    n_va_pct_coerced: int  # non-numeric VA% (error cells / strings) → NaN
    n_binding_recoded: int  # null → explicit outsourced category
    n_fx_converted: int  # Euro rows converted to GBP
    n_dwell_outliers: int  # dwell > threshold days, dwell nulled + counted
    n_product_collapsed: int  # rows whose raw product label was canonicalised
    n_partial_period: int  # rows in the incomplete final year
    partial_year: int | None
    as_of: str  # max(SalesIn), ISO: never datetime.now() (§10)


@dataclass(frozen=True)
class CleanResult:
    jobs: pd.DataFrame  # cleaned, GBP, closed and open, filter per module rule
    credits: pd.DataFrame  # quarantined Sell Price <= 0 rows, same schema
    report: CleanReport


def constraint_frame(jobs: pd.DataFrame, config: dict[str, Any]) -> pd.DataFrame:
    """Rows valid for contribution-per-constraint-hour analysis: Litho with
    press hours, closed jobs only (§3.3 traps 7-8). Adds log_rate, the
    §5.2 target: log(rate) clipped at the config floor, clipping keeps
    negative-contribution jobs in the frame instead of dropping them.

    Digital/Outwork/Wide Format carry no press hours; constraint analysis
    is Litho-only and every output surface must say so.
    """
    floor = float(config["clean"]["rate_floor_gbp_per_hr"])
    frame = jobs[
        (jobs["work_type"] == "Litho") & (jobs["press_hrs"] > 0) & jobs["is_closed"]
    ].copy()
    frame["log_rate"] = np.log(frame["rate_gbp_per_hr"].clip(lower=floor))
    return frame


def _fx_rate(row_month: pd.Series, fx_cfg: dict[str, Any]) -> pd.Series:
    """Per-row eur_per_gbp: monthly override if configured, else default."""
    monthly: dict[str, float] = fx_cfg.get("monthly") or {}
    default = float(fx_cfg["default_eur_per_gbp"])
    return row_month.map(lambda m: float(monthly.get(m, default)))


def clean(raw: pd.DataFrame, config: dict[str, Any]) -> CleanResult:
    """Apply every §3.3 handling rule; return jobs + credits + counts."""
    df = raw.rename(columns=RENAME).copy()
    df["sales_in"] = pd.to_datetime(df["sales_in"])
    df["sales_out"] = pd.to_datetime(df["sales_out"], errors="coerce")
    df["ship_date"] = pd.to_datetime(df["ship_date"], errors="coerce")

    # VA% arrives as float already (error cells → NaN at read); coerce guards
    # against string variants in future files. Count non-null → null flips.
    before = df["va_pct"].notna().sum()
    df["va_pct"] = pd.to_numeric(df["va_pct"], errors="coerce")
    n_va_coerced = int(before - df["va_pct"].notna().sum())

    # Binding: null means outsourced, recode to explicit category, never impute
    n_binding = int(df["binding_type"].isna().sum())
    df["binding_type"] = df["binding_type"].fillna(OUTSOURCED_BINDING)

    # Product canonicalisation (§3.4), canonical kept in data, raw preserved.
    # Null product (1 row in real export) becomes an explicit category.
    pmap: dict[str, str] = config["product_type_map"]
    df["product_type"] = (
        df["product_type_raw"].map(lambda v: pmap.get(v, v)).fillna("Unspecified")
    )
    n_collapsed = int(
        (df["product_type"] != df["product_type_raw"].fillna("Unspecified")).sum()
    )

    # FX, keyed off currency, never region (§3.3 trap 1)
    is_euro = df["currency"] == "Euro"
    month_key = df["sales_in"].dt.strftime("%Y-%m")
    rate = _fx_rate(month_key, config["fx"])
    for col in MONEY_COLUMNS:
        df[f"{col}_gbp"] = np.where(is_euro, df[col] / rate, df[col])

    # Derived fields
    df["is_digital"] = df["work_type"] == "Digital"
    df["is_closed"] = df["job_status"] == "z-Closed"
    # divide-by-zero path: Press hrs 0 (all Digital + some Litho) → NaN denominators
    df["press_hrs_nz"] = df["press_hrs"].replace(0, np.nan)
    df["rate_gbp_per_hr"] = df["va_amount_gbp"] / df["press_hrs_nz"]

    # dwell = Ship date − SalesIn, null-safe; outliers nulled and counted
    dwell = (df["ship_date"] - df["sales_in"]).dt.days
    max_dwell = int(config["clean"]["dwell_outlier_days"])
    n_dwell_out = int((dwell > max_dwell).sum())
    df["dwell_days"] = dwell.where(dwell <= max_dwell)

    # Partial period: the final year is incomplete iff data stops before 31 Dec.
    as_of = df["sales_in"].max()
    last_year = int(as_of.year)
    partial_year = last_year if as_of != pd.Timestamp(last_year, 12, 31) else None
    df["is_partial_period"] = df["year"] == partial_year if partial_year else False
    n_partial = int(df["is_partial_period"].sum())

    # Quarantine credits (Sell Price <= 0), separate frame, never dropped silently
    credit_mask = df["sell_price"] <= 0
    credits = df[credit_mask].copy()
    jobs = df[~credit_mask].copy()

    report = CleanReport(
        n_clean_rows=len(jobs),
        n_quarantined_credits=int(credit_mask.sum()),
        n_va_pct_coerced=n_va_coerced,
        n_binding_recoded=n_binding,
        n_fx_converted=int(is_euro.sum()),
        n_dwell_outliers=n_dwell_out,
        n_product_collapsed=n_collapsed,
        n_partial_period=n_partial,
        partial_year=partial_year,
        as_of=str(as_of.date()),
    )
    return CleanResult(jobs=jobs, credits=credits, report=report)
