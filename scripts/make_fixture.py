"""Generate the committed synthetic fixture at data/sample/sample.xlsx.

Same 36-column schema and sheet names as the real export, honouring every
§3.3 trap so ingest/clean/tests exercise real paths: both identities hold
exactly, two currencies (money in home currency), duplicate raw product
categories, credits (Sell Price <= 0), literal '#DIV/0!' in VA%, null
Binding Type (= outsourced), Press hrs 0 for Digital, open/held statuses,
null SalesOut/Ship date, a partial final period, and cross-currency
regions (Ireland with Stg jobs, NI with Euro jobs).

All values are synthetic. Deterministic under the seed. No real customer,
rep or commercial figure appears here.
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 20260803
N_ROWS = 400
N_CUSTOMERS = 12
DATA_START = date(2023, 1, 3)
DATA_END = date(2026, 5, 21)  # partial year, matches the real export's shape

COLUMNS = [
    "Title", "CustomerID", "Job Status", "SalesIn", "Year", "Month", "Week No",
    "SalesOut", "Quantity", "Sell Price", "Mup%", "VA Amount", "VA/24", "VA%",
    "VA/K", "Rebate", "Puchases", "Press hrs", "Impressions", "Handling",
    "Labour", "Paper", "labmup", "manadj", "mupnett", "Plates", "AmtInv",
    "Customer Name", "Rep", "Region", "Industry", "Work Type", "Product Type",
    "Binding Type", "Currency", "Ship date",
]

RAW_PRODUCT_TYPES = [  # includes duplicates the canonicalisation map must collapse
    "Brochures / Price LIst", "Brochures / Price List", "Leaflets to A4",
    "Leaflets to A4/ Price Lists", "Educational Books", "BPUK Softback Book",
    "BPUK Hardback Book", "Certficates", "Miscellaneous -ask advice", "Menu (Cafe/Restaurant)",
    "Menu (Takeaway/throwaway)", "Signage (large)", "Banners Printed", "Postage",
]
BINDING_TYPES = ["Saddle Stitched", "Perfect Bound", "Wiro", None, None]  # None = outsourced
INDUSTRIES = ["Education", "Public Sector", "Retail", "Hospitality", "Charity"]
WORK_TYPES = ["Litho", "Digital"]
REPS = ["REP_A", "REP_B", "REP_C"]


def _dates(rng: np.random.Generator, n: int, regular_mask: np.ndarray,
           customer_ids: np.ndarray) -> np.ndarray:
    """SalesIn dates: regular customers on a near-fixed cadence, others uniform."""
    span = (DATA_END - DATA_START).days
    out = np.empty(n, dtype=object)
    uniform = pd.Timestamp(DATA_START) + pd.to_timedelta(rng.integers(0, span + 1, n), unit="D")
    out[:] = [ts.date() for ts in uniform]
    for cust in np.unique(customer_ids[regular_mask]):
        idx = np.flatnonzero(customer_ids == cust)
        cadence = int(rng.integers(28, 45))
        start = int(rng.integers(0, 30))
        seq = [DATA_START + timedelta(days=start + i * cadence + int(rng.integers(-2, 3)))
               for i in range(len(idx))]
        out[idx] = [min(d, DATA_END) for d in seq]
    return out


def build_frame() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    cust_ids = rng.integers(1, N_CUSTOMERS + 1, N_ROWS)
    regular_customers = {1, 2, 3}  # low interval-CV accounts so the churn gate has both classes
    regular_mask = np.isin(cust_ids, list(regular_customers))

    sales_in = _dates(rng, N_ROWS, regular_mask, cust_ids)
    sales_in_ts = pd.to_datetime(pd.Series(sales_in))

    work_type = rng.choice(WORK_TYPES, N_ROWS, p=[0.75, 0.25])
    is_digital = work_type == "Digital"

    press_hrs = np.round(np.exp(rng.normal(0.8, 1.0, N_ROWS)), 2)
    press_hrs[is_digital] = 0.0
    press_hrs[~is_digital] = np.maximum(press_hrs[~is_digital], 0.25)

    quantity = rng.integers(50, 20_000, N_ROWS).astype(float)
    impressions = np.where(is_digital, 0, quantity * rng.uniform(1.0, 2.5, N_ROWS)).round()
    plates = np.where(is_digital, 0, rng.integers(1, 12, N_ROWS)).astype(float)

    purchases = np.round(np.exp(rng.normal(5.5, 1.0, N_ROWS)), 2)
    labour = np.round(np.exp(rng.normal(5.0, 0.9, N_ROWS)), 2)
    paper = np.round(purchases * rng.uniform(0.3, 0.7, N_ROWS), 2)
    handling = np.round(rng.uniform(0, 150, N_ROWS), 2)

    # contribution declines with size on average, so thresholds have something to find
    base_rate = np.exp(rng.normal(6.3, 0.5, N_ROWS)) / (1 + 0.15 * np.log1p(press_hrs))
    va_amount = np.round(np.where(is_digital, np.exp(rng.normal(5.8, 0.7, N_ROWS)),
                                  base_rate * np.maximum(press_hrs, 0.25)), 2)
    sell_price = np.round(va_amount + purchases, 2)

    # credits trap: a handful of rows with Sell Price <= 0
    credit_idx = rng.choice(N_ROWS, 12, replace=False)
    sell_price[credit_idx] = -np.abs(np.round(rng.uniform(10, 500, 12), 2))
    va_amount[credit_idx] = sell_price[credit_idx]

    labmup = np.round(labour * rng.uniform(0.2, 0.5, N_ROWS), 2)
    manadj = np.round(rng.normal(0, 80, N_ROWS), 2)
    manadj[rng.random(N_ROWS) < 0.35] = 0.0  # ~65% overridden, like the real data
    mupnett = np.round(labmup + manadj, 2)  # identity 2 holds exactly
    # real export has null manadj/mupnett (64) and null Puchases (12);
    # plant both so ingest/pricing null-handling is exercised
    null_adj = rng.choice(N_ROWS, 5, replace=False)
    manadj[null_adj] = np.nan
    mupnett[null_adj] = np.nan
    purchases[rng.choice(N_ROWS, 2, replace=False)] = np.nan

    with np.errstate(divide="ignore", invalid="ignore"):
        va24 = np.where(press_hrs > 0, va_amount / press_hrs * 24, 0.0)  # identity 1
        va_pct = np.where(sell_price != 0, va_amount / sell_price * 100, np.nan)
        va_k = np.where(quantity > 0, va_amount / quantity * 1000, 0.0)
        mup_pct = np.where(purchases > 0, va_amount / purchases * 100, 0.0)

    status = np.where(rng.random(N_ROWS) < 0.97, "z-Closed",
                      rng.choice(["Open", "Held"], N_ROWS))

    dwell = rng.integers(2, 40, N_ROWS)
    ship = sales_in_ts + pd.to_timedelta(dwell, unit="D")
    sales_out = ship - pd.to_timedelta(1, unit="D")
    ship_vals: np.ndarray = ship.dt.date.to_numpy(dtype=object).copy()
    sales_out_vals: np.ndarray = sales_out.dt.date.to_numpy(dtype=object).copy()
    ship_vals[rng.choice(N_ROWS, 15, replace=False)] = None    # Ship date nulls
    sales_out_vals[rng.choice(N_ROWS, 10, replace=False)] = None  # SalesOut nulls

    region = rng.choice(["NI", "Ireland", "GB"], N_ROWS, p=[0.45, 0.35, 0.20])
    currency = np.where(region == "Ireland", "Euro", "Stg")
    # cross-currency trap: some Ireland rows are Stg, some NI rows are Euro
    ie = np.flatnonzero(region == "Ireland")
    ni = np.flatnonzero(region == "NI")
    currency[rng.choice(ie, max(3, len(ie) // 15), replace=False)] = "Stg"
    currency[rng.choice(ni, max(3, len(ni) // 15), replace=False)] = "Euro"

    df = pd.DataFrame({
        "Title": [f"Job {i:04d}" for i in range(1, N_ROWS + 1)],
        "CustomerID": [f"CUST_{c:03d}" for c in cust_ids],
        "Job Status": status,
        "SalesIn": sales_in_ts.dt.date,
        "Year": sales_in_ts.dt.year,
        "Month": sales_in_ts.dt.month,
        "Week No": sales_in_ts.dt.isocalendar().week.astype(int).to_numpy(),
        "SalesOut": sales_out_vals,
        "Quantity": quantity,
        "Sell Price": sell_price,
        "Mup%": np.round(mup_pct, 2),
        "VA Amount": va_amount,
        "VA/24": va24,
        "VA%": np.round(va_pct, 2).astype(object),
        "VA/K": np.round(va_k, 2),
        "Rebate": np.round(rng.uniform(0, 50, N_ROWS) * (rng.random(N_ROWS) < 0.1), 2),
        "Puchases": purchases,  # misspelled in source, faithfully reproduced
        "Press hrs": press_hrs,
        "Impressions": impressions,
        "Handling": handling,
        "Labour": labour,
        "Paper": paper,
        "labmup": labmup,
        "manadj": manadj,
        "mupnett": mupnett,
        "Plates": plates,
        "AmtInv": sell_price,
        "Customer Name": [f"Customer {c:03d}" for c in cust_ids],
        "Rep": rng.choice(REPS, N_ROWS),
        "Region": region,
        "Industry": rng.choice(INDUSTRIES, N_ROWS),
        "Work Type": work_type,
        "Product Type": rng.choice(RAW_PRODUCT_TYPES, N_ROWS),
        "Binding Type": rng.choice(np.array(BINDING_TYPES, dtype=object), N_ROWS),
        "Currency": currency,
        "Ship date": ship_vals,
    })[COLUMNS]

    # '#DIV/0!' trap: literal Excel error strings in VA%
    div0_idx = rng.choice(N_ROWS, 8, replace=False)
    df.loc[df.index[div0_idx], "VA%"] = "#DIV/0!"
    return df


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "data" / "sample" / "sample.xlsx"
    out.parent.mkdir(parents=True, exist_ok=True)
    df = build_frame()
    field_defs = pd.DataFrame({
        "Field": COLUMNS,
        "Definition": ["Synthetic fixture field, see PROJECT_SCOPE.md §3"] * len(COLUMNS),
    })
    with pd.ExcelWriter(out, engine="openpyxl") as xl:
        df.to_excel(xl, sheet_name="Master Plain (Anon)", index=False)
        field_defs.to_excel(xl, sheet_name="Field Definitions", index=False)
    print(f"wrote {out} ({len(df)} rows)")


if __name__ == "__main__":
    main()
