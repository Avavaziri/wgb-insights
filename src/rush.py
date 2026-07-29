"""Short-notice (rush) jobs and the constraint (§5.5).

Rush is a *dwell-time proxy*: bottom-percentile dwell (SalesIn → Ship)
WITHIN size band — a big job turned around fast is rush, a small job
with the same dwell may not be. No scheduling-system data exists (§6),
so this proxies expediting, it does not measure it.

The main effect is a headline candidate. The rush × load interaction is
computed and displayed with its p-value; the descriptive load gradient
may appear ONLY adjacent to that failed test (§1), never in exported
assets. Load bins are RELATIVE weekly booked hours — never utilisation
percentages (no capacity data).
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from src.stats_core import EffectReport, effect, fit_reported

# Full controls (B4 claims robustness to them): size, run features,
# product, YEAR and CUSTOMER fixed effects. Note: with customer FE and
# the mandated cluster-robust SEs the rush p is ~0.04, far weaker than
# the scope's exploratory 2e-5 — that value is only reproducible with
# nonrobust SEs, which §2.3 forbids. Flagged, not tuned toward.
_CONTROLS = (
    "np.log(press_hrs) + np.log1p(quantity) + np.log1p(impressions)"
    " + plates + C(product_type) + C(year) + C(customer_id)"
)


def flag_rush(data: pd.DataFrame, percentile: float, size_bands: int) -> pd.Series:
    """Bottom-`percentile` dwell within press-hrs quantile band. Jobs with
    null dwell get False (unknowable, not rush)."""
    bands = pd.qcut(data["press_hrs"], size_bands, duplicates="drop")
    cutoffs = data.groupby(bands, observed=True)["dwell_days"].transform(
        lambda s: s.quantile(percentile)
    )
    return (data["dwell_days"] <= cutoffs).fillna(False)


def rush_effect(
    data: pd.DataFrame, percentile: float, size_bands: int, *, seed: int
) -> EffectReport:
    """Rush main effect on log contribution per constraint-hour, full
    controls, cluster-robust on customer (§2.3)."""
    df = data.assign(is_rush=flag_rush(data, percentile, size_bands).astype(int))
    fit, _ = fit_reported(
        f"log_rate ~ is_rush + {_CONTROLS}", df, cluster_on="customer_id", seed=seed
    )
    return effect(fit, "is_rush", logged_outcome=True)


def load_quantiles(data: pd.DataFrame, n_bins: int) -> pd.Series:
    """Relative load: total booked press hours in each job's SalesIn week,
    binned into n quantiles (0 = quietest). RELATIVE only — without
    capacity data these are never utilisation percentages."""
    week_key = data["sales_in"].dt.strftime("%G-%V")
    weekly_hours = data.groupby(week_key)["press_hrs"].transform("sum")
    return pd.Series(
        pd.qcut(weekly_hours, n_bins, labels=False, duplicates="drop"),
        index=data.index,
        name="load_bin",
    )


def rush_load_interaction(
    data: pd.DataFrame,
    percentile: float,
    size_bands: int,
    n_load_bins: int,
    *,
    seed: int,
) -> dict[str, Any]:
    """Interaction term + simple slopes, reported separately (§5.5).

    Output text where the interaction fails: consistent with queueing
    theory (Kingman/VUT), not established by this data.
    """
    df = data.assign(
        is_rush=flag_rush(data, percentile, size_bands).astype(int),
        load_bin=load_quantiles(data, n_load_bins).astype(float),
    ).dropna(subset=["load_bin"])
    fit, _ = fit_reported(
        f"log_rate ~ is_rush + load_bin + is_rush:load_bin + {_CONTROLS}",
        df,
        cluster_on="customer_id",
        seed=seed,
    )
    interaction = effect(fit, "is_rush:load_bin", logged_outcome=True)

    slopes: list[dict[str, Any]] = []
    for b in sorted(df["load_bin"].unique()):
        sub = df[df["load_bin"] == b]
        if sub["is_rush"].nunique() < 2:
            continue
        sfit, _ = fit_reported(
            f"log_rate ~ is_rush + {_CONTROLS}", sub, cluster_on="customer_id", seed=seed
        )
        srep = effect(sfit, "is_rush", logged_outcome=True)
        slopes.append(
            {"load_bin": int(b), "pct_effect": srep.pct_effect, "p_value": srep.p_value,
             "n": srep.n_obs}
        )
    return {"interaction": interaction, "simple_slopes": slopes}


def percentile_sensitivity(
    data: pd.DataFrame, percentiles: list[float], size_bands: int, *, seed: int
) -> pd.DataFrame:
    """Rush effect across flag percentiles (§5.8 named check 3)."""
    rows = []
    for p in percentiles:
        rep = rush_effect(data, p, size_bands, seed=seed)
        rows.append(
            {
                "percentile": p,
                "pct_effect": rep.pct_effect,
                "p_value": rep.p_value,
                "n_rush": int(flag_rush(data, p, size_bands).sum()),
            }
        )
    return pd.DataFrame(rows)
