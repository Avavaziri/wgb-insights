"""thresholds + decomposition on synthetic frames with known structure (§8)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.decomposition import nested_decomposition, rep_naive_vs_controlled
from src.thresholds import (
    benchmark_rate,
    breakpoints_cart,
    breakpoints_grid,
    capacity_share_above,
    crossover_ci,
    crossover_point,
    monotonicity_report,
    rolling_rate_curve,
    window_sensitivity,
)

SEED = 42


def synthetic_constraint_frame(
    n: int = 2000, breakpoint_hrs: float = 5.0, seed: int = SEED
) -> pd.DataFrame:
    """Rate = 900 GBP/hr below the breakpoint, 500 above, small noise: a
    step function whose crossover the estimator must recover."""
    rng = np.random.default_rng(seed)
    hrs = np.exp(rng.uniform(np.log(0.5), np.log(40), n))
    rate = np.where(hrs < breakpoint_hrs, 900.0, 500.0) * rng.lognormal(0, 0.08, n)
    df = pd.DataFrame(
        {
            "press_hrs": hrs,
            "rate_gbp_per_hr": rate,
            "va_amount_gbp": rate * hrs,
            "customer_id": [f"C{i % 40:02d}" for i in range(n)],
            "rep": [f"R{i % 5}" for i in range(n)],
            "product_type": [f"P{i % 8}" for i in range(n)],
            "quantity": rng.integers(100, 10_000, n).astype(float),
            "impressions": rng.integers(100, 30_000, n).astype(float),
            "plates": rng.integers(1, 10, n).astype(float),
            "year": rng.choice([2023, 2024, 2025], n),
        }
    )
    df["log_rate"] = np.log(df["rate_gbp_per_hr"].clip(lower=1.0))
    return df


@pytest.fixture(scope="module")
def frame() -> pd.DataFrame:
    return synthetic_constraint_frame()


class TestBenchmarkAndCurve:
    def test_benchmark_is_hour_weighted(self, frame: pd.DataFrame) -> None:
        bench = benchmark_rate(frame)
        unweighted = frame["rate_gbp_per_hr"].mean()
        assert bench == pytest.approx(
            frame["va_amount_gbp"].sum() / frame["press_hrs"].sum()
        )
        # long jobs earn less → hour-weighting must pull the benchmark down
        assert bench < unweighted

    def test_curve_monotone_sizes(self, frame: pd.DataFrame) -> None:
        curve = rolling_rate_curve(frame, window=300, step=50)
        assert curve["size_hrs"].is_monotonic_increasing
        assert (curve["rate"] > 0).all()


class TestCrossoverRecovery:
    def test_known_breakpoint_recovered(self, frame: pd.DataFrame) -> None:
        # §8: crossover recovery on synthetic data with a known breakpoint.
        # Rates step 900 -> 500 at 5.0h; against a benchmark set midway
        # (700), the curve must cross at the structural break.
        curve = rolling_rate_curve(frame, window=300, step=50)
        assert crossover_point(curve, benchmark=700.0) == pytest.approx(5.0, abs=1.0)
        # against the hour-weighted benchmark (~548, dominated by long
        # jobs) the crossover is necessarily later, but bounded
        xover = crossover_point(curve, benchmark_rate(frame))
        assert 5.0 <= xover <= 9.0

    def test_never_crossing_returns_nan(self, frame: pd.DataFrame) -> None:
        curve = rolling_rate_curve(frame, window=300, step=50)
        assert np.isnan(crossover_point(curve, benchmark=1.0))

    def test_bootstrap_ci_brackets_point_and_is_seeded(self, frame: pd.DataFrame) -> None:
        small = frame.sample(600, random_state=SEED)
        ci1 = crossover_ci(small, n_boot=60, seed=SEED, window=200, step=50)
        ci2 = crossover_ci(small, n_boot=60, seed=SEED, window=200, step=50)
        assert ci1 == ci2  # deterministic under seed
        point = crossover_point(
            rolling_rate_curve(small, 200, 50), benchmark_rate(small)
        )
        assert ci1[0] - 0.5 <= point <= ci1[1] + 0.5
        assert ci1[0] < ci1[1]

    def test_window_sensitivity_range(self, frame: pd.DataFrame) -> None:
        sens = window_sensitivity(frame, windows=[200, 300, 400], step=50)
        assert len(sens) == 3
        assert sens["crossover_hrs"].between(3.0, 8.0).all()


class TestMonotonicityAndBands:
    def test_monotone_decline_no_interior_optimum(self, frame: pd.DataFrame) -> None:
        rep = monotonicity_report(frame, window=300, step=50)
        assert rep["spearman_rho"] < -0.5
        assert not rep["interior_optimum"]

    def test_interior_optimum_detected_when_present(self) -> None:
        # hump-shaped rate: peak in the middle → verdict must flip
        rng = np.random.default_rng(SEED)
        hrs = np.exp(rng.uniform(np.log(0.5), np.log(40), 2000))
        rate = 400 + 500 * np.exp(-((np.log(hrs) - np.log(6)) ** 2)) * rng.lognormal(0, 0.05, 2000)
        df = pd.DataFrame(
            {"press_hrs": hrs, "rate_gbp_per_hr": rate, "va_amount_gbp": rate * hrs}
        )
        rep = monotonicity_report(df, window=300, step=50)
        assert rep["interior_optimum"]

    def test_cart_finds_breakpoint(self, frame: pd.DataFrame) -> None:
        bps = breakpoints_cart(frame, max_leaves=3, min_samples_leaf=100)
        assert any(abs(b - 5.0) < 1.0 for b in bps)

    def test_grid_respects_min_group(self, frame: pd.DataFrame) -> None:
        bps = breakpoints_grid(frame, k=4, min_group=100)
        for b in bps:
            assert (frame["press_hrs"] <= b).sum() >= 100
            assert (frame["press_hrs"] > b).sum() >= 100

    def test_capacity_share_descriptive_form(self, frame: pd.DataFrame) -> None:
        share = capacity_share_above(frame, crossover_hrs=5.0)
        assert 0 < share["share_of_constraint_hours"] < 1
        assert share["pooled_rate_above"] < share["benchmark"]  # above-crossover earns less


class TestDecomposition:
    def test_customer_block_dominates_when_planted(self) -> None:
        # plant a strong customer effect and weak product effect; the table
        # must attribute CV R² accordingly
        rng = np.random.default_rng(SEED)
        n = 3000
        cust = rng.integers(0, 30, n)
        cust_fx = rng.normal(0, 0.6, 30)[cust]
        hrs = np.exp(rng.uniform(0, 3, n))
        log_rate = 6.0 - 0.3 * np.log(hrs) + cust_fx + rng.normal(0, 0.3, n)
        df = pd.DataFrame(
            {
                "log_rate": log_rate,
                "press_hrs": hrs,
                "quantity": rng.integers(100, 5000, n).astype(float),
                "impressions": rng.integers(100, 5000, n).astype(float),
                "plates": rng.integers(1, 8, n).astype(float),
                "product_type": [f"P{i % 6}" for i in range(n)],
                "customer_id": [f"C{c:02d}" for c in cust],
                "rep": [f"R{i % 4}" for i in range(n)],
                "year": rng.choice([2023, 2024, 2025], n),
            }
        )
        table = nested_decomposition(
            df, "log_rate", ["size", "run_features", "product", "customer", "rep"],
            cluster_on="customer_id", seed=SEED,
        )
        by_block = table.set_index("block")
        assert by_block.loc["customer", "cv_increment"] > 0.2
        assert by_block.loc["product", "cv_increment"] < 0.05
        assert by_block.loc["rep", "cv_increment"] < 0.02
        # rep adds nothing real → must not clear the in_sample_only bar either
        assert by_block.loc["rep", "f_p_vs_prev"] > 0.001 or by_block.loc["rep", "in_sample_only"]

    def test_unknown_block_raises(self, frame: pd.DataFrame) -> None:
        with pytest.raises(KeyError, match="unknown"):
            nested_decomposition(frame, "log_rate", ["size", "bogus"], cluster_on="customer_id")

    def test_rep_naive_vs_controlled_pair(self, frame: pd.DataFrame) -> None:
        out = rep_naive_vs_controlled(frame, "log_rate", seed=SEED)
        assert set(out) >= {"naive", "controlled_f_p", "controlled_cv_increment"}
        assert out["naive"].formula == "log_rate ~ C(rep)"
