"""Job size vs contribution per constraint-hour: curve, crossover, CI (§5.3).

All functions take the constraint frame (Litho, press hrs > 0, closed; see
clean.constraint_frame). Rates are GBP per press hour. The crossover is
never reported as a bare point: point + window-sensitivity range +
bootstrap CI travel together, and monotonicity_report runs BEFORE any
banding, if new data ever shows an interior optimum, the framing
changes and the verdict is displayed.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
import scipy.stats
from sklearn.tree import DecisionTreeRegressor


def benchmark_rate(data: pd.DataFrame) -> float:
    """Hour-weighted mean rate: total contribution / total press hours.

    Weighting by hours makes this the factory's own average earning rate
    per constraint-hour: the internal benchmark the curve is judged
    against (no external capacity data exists, §6).
    """
    return float(data["va_amount_gbp"].sum() / data["press_hrs"].sum())


def rolling_rate_curve(data: pd.DataFrame, window: int, step: int) -> pd.DataFrame:
    """Pooled rate over size-sorted windows of jobs.

    Each row: median job size (press hrs) in the window and the pooled
    rate sum(contribution)/sum(hours). Pooling within the window (not a
    mean of ratios) keeps the estimate hour-weighted, matching the
    benchmark's construction.
    """
    df = data.sort_values("press_hrs").reset_index(drop=True)
    rows: list[dict[str, float]] = []
    for start in range(0, max(len(df) - window + 1, 1), step):
        w = df.iloc[start : start + window]
        rows.append(
            {
                "size_hrs": float(w["press_hrs"].median()),
                "rate": float(w["va_amount_gbp"].sum() / w["press_hrs"].sum()),
                "n": float(len(w)),
            }
        )
    return pd.DataFrame(rows)


def crossover_point(curve: pd.DataFrame, benchmark: float) -> float:
    """Smallest window size where the curve falls below the benchmark AND
    stays below for every larger window. NaN if it never does."""
    below = (curve["rate"] < benchmark).to_numpy()
    stays_below = np.logical_and.accumulate(below[::-1])[::-1]
    idx = np.flatnonzero(stays_below)
    if len(idx) == 0:
        return float("nan")
    return float(curve["size_hrs"].iloc[idx[0]])


def crossover_ci(
    data: pd.DataFrame,
    n_boot: int,
    seed: int,
    *,
    window: int,
    step: int,
) -> tuple[float, float]:
    """Bootstrap 95% CI on the crossover: resample jobs (≥500 draws, §2.5),
    recompute benchmark + curve + crossover each draw."""
    rng = np.random.default_rng(seed)
    points: list[float] = []
    n = len(data)
    for _ in range(n_boot):
        sample = data.iloc[rng.integers(0, n, n)]
        curve = rolling_rate_curve(sample, window, step)
        points.append(crossover_point(curve, benchmark_rate(sample)))
    arr = np.array(points)
    arr = arr[~np.isnan(arr)]
    lo, hi = np.percentile(arr, [2.5, 97.5])
    return float(lo), float(hi)


def breakpoints_grid(data: pd.DataFrame, k: int, min_group: int) -> list[float]:
    """Quantile size-band boundaries (k groups), merged where a band would
    fall below min_group jobs. Charting rollup, not analysis."""
    qs = np.linspace(0, 1, k + 1)[1:-1]
    bounds = data["press_hrs"].quantile(qs).tolist()
    out: list[float] = []
    for b in bounds:
        n_below = int((data["press_hrs"] <= b).sum())
        n_above = int((data["press_hrs"] > b).sum())
        if n_below >= min_group and n_above >= min_group:
            out.append(float(b))
    return sorted(set(out))


def breakpoints_cart(data: pd.DataFrame, max_leaves: int, min_samples_leaf: int) -> list[float]:
    """CART split points on log_rate ~ press_hrs, data-derived banding
    alternative to quantiles (§2.5: thresholds derived, never asserted)."""
    tree = DecisionTreeRegressor(
        max_leaf_nodes=max_leaves, min_samples_leaf=min_samples_leaf, random_state=0
    )
    x = data[["press_hrs"]].to_numpy()
    tree.fit(x, data["log_rate"].to_numpy())
    thresholds = tree.tree_.threshold[tree.tree_.feature == 0]
    return sorted(float(t) for t in thresholds)


def monotonicity_report(
    data: pd.DataFrame, *, window: int, step: int, interior_margin: float = 0.05
) -> dict[str, Any]:
    """Runs BEFORE any banding (§5.3). Verdict displayed in the app.

    interior_optimum is True only if the curve's maximum sits away from
    the smallest-jobs end (beyond `interior_margin` of windows), if it
    ever flips True on new data, 'crossover' framing is wrong and the
    output says so.
    """
    rho, p = scipy.stats.spearmanr(data["press_hrs"], data["rate_gbp_per_hr"])
    curve = rolling_rate_curve(data, window, step)
    argmax = int(curve["rate"].idxmax())
    # interior optimum needs a rise before the fall: the max must beat the
    # smallest-jobs end by a margin, not just be plateau noise
    early_zone = max(1, int(len(curve) * 0.05))
    early_rate = float(curve["rate"].iloc[:early_zone].mean())
    interior = argmax >= early_zone and float(curve["rate"].iloc[argmax]) > early_rate * (
        1 + interior_margin
    )
    return {
        "spearman_rho": float(rho),
        "spearman_p": float(p),
        "n": int(len(data)),
        "curve_max_at_size_hrs": float(curve["size_hrs"].iloc[argmax]),
        "curve_max_window_index": argmax,
        "n_windows": int(len(curve)),
        "interior_optimum": bool(interior),
    }


def window_sensitivity(
    data: pd.DataFrame, windows: list[int], *, step: int
) -> pd.DataFrame:
    """Crossover across window widths (§5.8 named check 2): the range
    that must accompany every crossover statement."""
    bench = benchmark_rate(data)
    rows = [
        {
            "window": w,
            "crossover_hrs": crossover_point(rolling_rate_curve(data, w, step), bench),
        }
        for w in windows
    ]
    return pd.DataFrame(rows)


def capacity_share_above(data: pd.DataFrame, crossover_hrs: float) -> dict[str, float]:
    """Descriptive form ONLY (§1): share of constraint-hours in jobs above
    the crossover and the pooled rate they earn vs the benchmark. No
    counterfactual GBP figure, capacity data doesn't exist."""
    above = data[data["press_hrs"] > crossover_hrs]
    total_hrs = float(data["press_hrs"].sum())
    above_hrs = float(above["press_hrs"].sum())
    return {
        # NaN crossover (curve never crosses) → empty 'above' → NaN share,
        # never a fake zero
        "share_of_constraint_hours": above_hrs / total_hrs if len(above) else float("nan"),
        "pooled_rate_above": (
            float(above["va_amount_gbp"].sum()) / above_hrs if above_hrs else float("nan")
        ),
        "benchmark": benchmark_rate(data),
        "n_jobs_above": float(len(above)),
    }
