"""pricing, rush, churn, trend — §8 test list items and module contracts."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.churn import cadence_stats, compare_fixed_rule, regularity_gate, risk_table
from src.pricing import (
    OverrideIdentityError,
    override_effect,
    override_flags,
    override_model,
    override_scale,
    validate_override_identity,
)
from src.rush import flag_rush, load_quantiles, percentile_sensitivity, rush_effect
from src.trend import concentration, gini, growth_attribution, yearly_trend

SEED = 42
TOL = 0.005


def jobs_frame(n: int = 1200, seed: int = SEED) -> pd.DataFrame:
    """Synthetic cleaned-jobs frame with known override/rush/cadence structure."""
    rng = np.random.default_rng(seed)
    sales_in = pd.Timestamp("2023-01-03") + pd.to_timedelta(
        rng.integers(0, 1200, n), unit="D"
    )
    press_hrs = np.exp(rng.uniform(np.log(0.5), np.log(30), n))
    rate = 800 * np.exp(rng.normal(0, 0.3, n)) / (1 + 0.1 * np.log1p(press_hrs))
    va = rate * press_hrs
    labmup = np.round(rng.uniform(50, 300, n), 2)
    manadj = np.where(rng.random(n) < 0.6, np.round(rng.normal(30, 90, n), 2), 0.0)
    df = pd.DataFrame(
        {
            "customer_id": [f"C{i % 30:02d}" for i in range(n)],
            "rep": [f"R{i % 4}" for i in range(n)],
            "sales_in": sales_in,
            "year": sales_in.year,
            "press_hrs": press_hrs,
            "quantity": rng.integers(100, 10_000, n).astype(float),
            "impressions": rng.integers(100, 30_000, n).astype(float),
            "plates": rng.integers(1, 10, n).astype(float),
            "product_type": [f"P{i % 6}" for i in range(n)],
            "work_type": "Litho",
            "binding_type": rng.choice(["Saddle", "Outsourced binding"], n),
            "currency": rng.choice(["Stg", "Euro"], n),
            "region": rng.choice(["NI", "Ireland", "GB"], n),
            "va_amount_gbp": va,
            "sell_price_gbp": va * 1.6,
            "rate_gbp_per_hr": rate,
            "log_rate": np.log(np.clip(rate, 1.0, None)),
            "labmup": labmup,
            "manadj": manadj,
            "mupnett": labmup + manadj,
            "manadj_gbp": manadj,
            "dwell_days": rng.integers(2, 60, n).astype(float),
            "is_closed": True,
            "is_partial_period": sales_in.year == 2026,
        }
    )
    return df


@pytest.fixture(scope="module")
def jobs() -> pd.DataFrame:
    return jobs_frame()


class TestPricing:
    def test_identity_guard_raises_on_broken_file(self, jobs: pd.DataFrame) -> None:
        broken = jobs.copy()
        broken.loc[broken.index[5], "mupnett"] += 3.0
        with pytest.raises(OverrideIdentityError):
            validate_override_identity(broken)
        validate_override_identity(jobs)  # intact passes

    def test_flags_and_scale(self, jobs: pd.DataFrame) -> None:
        flags = override_flags(jobs, TOL)
        scale = override_scale(jobs, TOL)
        assert scale["override_rate"] == pytest.approx(0.6, abs=0.06)
        assert scale["n_up"] + scale["n_down"] == int(flags["overridden"].sum())
        assert scale["n_up"] > scale["n_down"]  # planted +30 mean drift
        assert scale["net_gbp_per_year"] > 0

    def test_null_manadj_excluded_never_imputed(self, jobs: pd.DataFrame) -> None:
        df = jobs.copy()
        df.loc[df.index[:20], ["manadj", "manadj_gbp", "mupnett"]] = np.nan
        flags = override_flags(df, TOL)
        assert flags["overridden"].isna().sum() == 20
        assert override_scale(df, TOL)["n_unknown_manadj"] == 20

    def test_override_effect_is_effect_report(self, jobs: pd.DataFrame) -> None:
        rep = override_effect(jobs, TOL, seed=SEED)
        assert rep.pct_effect is not None
        assert rep.n_clusters == 30
        assert rep.p_value_adj is None  # BH pass fills this, nothing else

    def test_override_model_groupkfold_and_baselines(self, jobs: pd.DataFrame) -> None:
        # §8: GroupKFold grouping actually by customer is asserted inside
        # override_model on every fold; here we verify it runs and reports
        # all three mandatory baselines
        cfg = {
            "pricing": {"group_kfold_folds": 5, "model_family": "ridge"},
            "clean": {"override_tolerance_gbp": TOL},
        }
        report = override_model(jobs, cfg, seed=SEED)
        assert report.cv_folds == 5
        assert report.n_clusters == 30
        # manadj is pure noise vs features here → must NOT beat baselines
        assert not report.beats_all_baselines
        assert 0.3 < report.auc_direction < 0.7
        assert len(report.top_features) == 5


class TestRush:
    def test_flag_within_size_band(self, jobs: pd.DataFrame) -> None:
        flags = flag_rush(jobs, 0.2, 4)
        assert flags.mean() == pytest.approx(0.2, abs=0.05)
        # within each band the flagged jobs are that band's fastest
        bands = pd.qcut(jobs["press_hrs"], 4, duplicates="drop")
        for _, grp in jobs.assign(rush=flags).groupby(bands, observed=True):
            if grp["rush"].any():
                assert grp.loc[grp["rush"], "dwell_days"].max() <= grp.loc[
                    ~grp["rush"], "dwell_days"
                ].min() + 1

    def test_null_dwell_never_rush(self, jobs: pd.DataFrame) -> None:
        df = jobs.copy()
        df.loc[df.index[:15], "dwell_days"] = np.nan
        assert not flag_rush(df, 0.2, 4).iloc[:15].any()

    def test_planted_rush_penalty_recovered(self) -> None:
        df = jobs_frame(2000)
        flags = flag_rush(df, 0.2, 4)
        df.loc[flags, "log_rate"] -= 0.10  # plant a -10% (log) rush penalty
        rep = rush_effect(df, 0.2, 4, seed=SEED)
        assert rep.pct_effect is not None
        assert rep.pct_effect == pytest.approx(-9.5, abs=3.0)
        assert rep.p_value < 0.01

    def test_load_bins_relative(self, jobs: pd.DataFrame) -> None:
        bins = load_quantiles(jobs, 3)
        assert set(bins.dropna().unique()) <= {0, 1, 2}

    def test_percentile_sensitivity_table(self, jobs: pd.DataFrame) -> None:
        sens = percentile_sensitivity(jobs, [0.15, 0.25], 4, seed=SEED)
        assert list(sens["percentile"]) == [0.15, 0.25]
        assert (sens["n_rush"].diff().dropna() > 0).all()


class TestChurn:
    def cadence_data(self) -> pd.DataFrame:
        """Two regular accounts (30d, 60d cadence), one irregular, one new."""
        rows = []
        for d in pd.date_range("2023-01-10", "2026-04-30", freq="30D"):
            rows.append({"customer_id": "REGULAR_30", "sales_in": d})
        for d in pd.date_range("2023-02-01", "2025-06-01", freq="60D"):
            rows.append({"customer_id": "REGULAR_60_LAPSED", "sales_in": d})
        # explicit gaps with CV ~1.1 (>0.75 gate) staying inside the window
        base = pd.Timestamp("2023-01-05")
        for gap in [7, 350, 10, 200, 5, 400, 20, 15, 100]:
            base += pd.Timedelta(days=gap)
            rows.append({"customer_id": "IRREGULAR", "sales_in": base})
        # steady 20-day account gone quiet ~50 days: personalised catches
        # it, a fixed 90-day rule doesn't
        for d in pd.date_range("2024-01-01", "2026-03-11", freq="20D"):
            rows.append({"customer_id": "STEADY_20_LAPSED", "sales_in": d})
        rows.append({"customer_id": "NEW_ONE_ORDER", "sales_in": pd.Timestamp("2026-05-01")})
        df = pd.DataFrame(rows)
        df["sales_in"] = pd.to_datetime(df["sales_in"])
        return df

    def test_as_of_derives_from_data_not_now(self) -> None:
        # §8: as_of behaviour — identical result on the same file, any day
        df = self.cadence_data()
        c1 = cadence_stats(df)
        c2 = cadence_stats(df, as_of=df["sales_in"].max())
        pd.testing.assert_frame_equal(c1, c2)
        assert c1.loc["REGULAR_30", "gap_days"] <= 30 + 21  # gap vs data end, not today

    def test_distinct_dates_one_event(self) -> None:
        df = self.cadence_data()
        tripled = pd.concat([df, df, df])  # multi-line orders same day
        pd.testing.assert_frame_equal(cadence_stats(df), cadence_stats(tripled))

    def test_gate_and_reasons(self) -> None:
        df = self.cadence_data()
        table = risk_table(df, multiplier=1.5, cv_max=0.75, min_orders=4)
        assert bool(table.loc["REGULAR_30", "forecastable"])
        assert not bool(table.loc["IRREGULAR", "forecastable"])
        assert table.loc["IRREGULAR", "reason_code"] == "irregular_cadence"
        assert table.loc["NEW_ONE_ORDER", "reason_code"] == "too_few_orders"
        assert pd.isna(table.loc["IRREGULAR", "expected_next_order"])
        assert pd.notna(table.loc["REGULAR_30", "expected_next_order"])
        # lapsed regular: ~330 days silent vs 60d own cadence → overdue
        assert table.loc["REGULAR_60_LAPSED", "reason_code"] == "overdue_vs_own_cadence"
        assert table.loc["REGULAR_60_LAPSED", "risk_band"] == "high"

    def test_fixed_vs_personalised_sets_differ(self) -> None:
        df = self.cadence_data()
        cmp = compare_fixed_rule(df, 90, multiplier=1.5, cv_max=0.75, min_orders=4)
        # long-lapsed regular: both rules agree
        assert "REGULAR_60_LAPSED" in cmp["both"]
        # steady 20-day account ~50 days silent: only the personalised
        # threshold fires — the whole point of the comparison
        assert "STEADY_20_LAPSED" in cmp["only_personalised"]
        assert cmp["sets_differ"]

    def test_gate_boundary(self) -> None:
        cadence = pd.DataFrame(
            {"n_orders": [10, 10, 3], "cv": [0.74, 0.76, 0.2]},
            index=["ok", "too_variable", "too_few"],
        )
        gate = regularity_gate(cadence, cv_max=0.75, min_orders=4)
        assert gate.tolist() == [True, False, False]


class TestTrend:
    def test_full_years_only_and_attribution(self, jobs: pd.DataFrame) -> None:
        trend = yearly_trend(jobs)
        assert 2026 not in trend.index  # partial year excluded
        attr = growth_attribution(trend)
        # identity: (1+rev) == (1+jobs)(1+rev/job) in logs
        lhs = np.log1p(attr["revenue_cagr"])
        rhs = np.log1p(attr["jobs_cagr"]) + np.log1p(attr["revenue_per_job_cagr"])
        assert lhs == pytest.approx(rhs, abs=1e-9)

    def test_gini_known_values(self) -> None:
        assert gini(np.array([1.0, 1.0, 1.0, 1.0])) == pytest.approx(0.0, abs=1e-9)
        assert gini(np.array([0.0, 0.0, 0.0, 100.0])) == pytest.approx(0.75, abs=0.01)

    def test_concentration_shares_ordered(self, jobs: pd.DataFrame) -> None:
        c = concentration(jobs)
        assert c["top_1_share"] < c["top_3_share"] < c["top_5_share"] < c["top_10_share"] <= 1
        assert 0 <= c["gini"] <= 1
