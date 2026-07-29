"""stats_core is the contract everything else builds on — tested first (§11 step 2)."""

from __future__ import annotations

import dataclasses

import numpy as np
import pandas as pd
import pytest

from src.stats_core import (
    EffectReport,
    ModelReport,
    _parse_formula,
    cliffs_delta,
    cv_r2,
    effect,
    fit_reported,
    mannwhitney_reported,
    nested_f_test,
)

SEED = 42


@pytest.fixture()
def linear_data() -> pd.DataFrame:
    """y = 2x + customer effect + noise, clustered by customer."""
    rng = np.random.default_rng(SEED)
    n_customers, per = 25, 40
    cust = np.repeat([f"C{i:02d}" for i in range(n_customers)], per)
    cust_fx = np.repeat(rng.normal(0, 1.5, n_customers), per)
    x = rng.normal(0, 1, n_customers * per)
    y = 2.0 * x + cust_fx + rng.normal(0, 1, n_customers * per)
    return pd.DataFrame({"y": y, "x": x, "customer": cust})


class TestDataclassContracts:
    def test_model_report_frozen(self) -> None:
        r = ModelReport(0.5, 0.49, 0.45, 5, 3, 100, None, "y ~ x")
        with pytest.raises(dataclasses.FrozenInstanceError):
            r.r2 = 0.9  # type: ignore[misc]

    def test_model_report_requires_all_fields(self) -> None:
        with pytest.raises(TypeError):
            ModelReport(r2=0.5)  # type: ignore[call-arg]

    def test_effect_report_requires_all_fields(self) -> None:
        with pytest.raises(TypeError):
            EffectReport(name="x", coef=1.0, p_value=0.01)  # type: ignore[call-arg]

    def test_effect_report_frozen(self) -> None:
        r = EffectReport("x", 1.0, None, 0.5, 1.5, 0.01, None, 100, None, "nonrobust")
        with pytest.raises(dataclasses.FrozenInstanceError):
            r.p_value = 0.5  # type: ignore[misc]


class TestFormulaParsing:
    def test_mixed_terms(self) -> None:
        target, tf, num, cat = _parse_formula(
            "np.log(rate) ~ np.log(size) + qty + C(product) + C(customer)"
        )
        assert (target, tf) == ("rate", "log")
        assert num == ["np.log(size)", "qty"]
        assert cat == ["product", "customer"]

    def test_unsupported_term_raises(self) -> None:
        with pytest.raises(ValueError, match="Unsupported"):
            _parse_formula("y ~ x1 * x2")


class TestFitReported:
    def test_recovers_coefficient(self, linear_data: pd.DataFrame) -> None:
        fit, report = fit_reported("y ~ x", linear_data, cluster_on="customer", seed=SEED)
        assert fit.params["x"] == pytest.approx(2.0, abs=0.15)
        assert 0 < report.r2 < 1
        assert report.r2_adj <= report.r2
        assert report.n_obs == 1000
        assert report.n_clusters == 25
        assert report.cv_folds == 5
        assert report.formula == "y ~ x"

    def test_seed_required(self, linear_data: pd.DataFrame) -> None:
        with pytest.raises(ValueError, match="seed"):
            fit_reported("y ~ x", linear_data)

    def test_cluster_se_wider_than_nonrobust(self, linear_data: pd.DataFrame) -> None:
        # customer effects omitted from the model → clustered noise → cluster
        # SEs must exceed the naive ones. This is the §2.3 defect detector.
        fit_cl, _ = fit_reported("y ~ x", linear_data, cluster_on="customer", seed=SEED)
        fit_plain, _ = fit_reported("y ~ x", linear_data, seed=SEED)
        assert fit_cl.bse["Intercept"] > fit_plain.bse["Intercept"]

    def test_deterministic_under_seed(self, linear_data: pd.DataFrame) -> None:
        _, r1 = fit_reported("y ~ x", linear_data, seed=SEED)
        _, r2 = fit_reported("y ~ x", linear_data, seed=SEED)
        assert r1.r2_cv == r2.r2_cv


class TestEffect:
    def test_logged_outcome_back_transform(self, linear_data: pd.DataFrame) -> None:
        df = linear_data.assign(ylog=np.exp(linear_data.y / 10))
        fit, _ = fit_reported("np.log(ylog) ~ x", df, cluster_on="customer", seed=SEED)
        rep = effect(fit, "x", logged_outcome=True)
        assert rep.pct_effect == pytest.approx((np.exp(rep.coef) - 1) * 100)
        assert rep.ci_low < rep.coef < rep.ci_high
        assert rep.p_value_adj is None  # only checks.py BH pass fills this
        assert rep.n_clusters == 25
        assert "cluster-robust" in rep.se_type

    def test_not_logged_gives_none_pct(self, linear_data: pd.DataFrame) -> None:
        fit, _ = fit_reported("y ~ x", linear_data, seed=SEED)
        assert effect(fit, "x", logged_outcome=False).pct_effect is None

    def test_missing_term_raises(self, linear_data: pd.DataFrame) -> None:
        fit, _ = fit_reported("y ~ x", linear_data, seed=SEED)
        with pytest.raises(KeyError):
            effect(fit, "nonexistent")


class TestCvR2:
    def test_high_dim_categorical_overfits_in_sample_not_cv(self) -> None:
        # The §2.1 rationale: many-level categoricals inflate in-sample R²
        # on pure noise; CV R² must stay near zero or below.
        rng = np.random.default_rng(SEED)
        n = 400
        df = pd.DataFrame(
            {"y": rng.normal(size=n), "cat": [f"L{i}" for i in rng.integers(0, 80, n)]}
        )
        fit, report = fit_reported("y ~ C(cat)", df, seed=SEED)
        assert report.r2 > 0.1
        assert report.r2_cv < 0.05

    def test_unseen_category_does_not_crash(self) -> None:
        rng = np.random.default_rng(SEED)
        n = 100
        # one category appears once — guaranteed unseen in some train fold
        cats = ["common"] * (n - 1) + ["rare-once"]
        df = pd.DataFrame({"y": rng.normal(size=n), "cat": cats})
        val = cv_r2(df, "y", [], ["cat"], folds=5, seed=SEED)
        assert np.isfinite(val)

    def test_signal_recovered(self) -> None:
        rng = np.random.default_rng(SEED)
        n = 500
        x = rng.normal(size=n)
        df = pd.DataFrame({"y": 3 * x + rng.normal(0, 0.5, n), "x": x})
        assert cv_r2(df, "y", ["x"], [], folds=5, seed=SEED) > 0.9


class TestMannWhitney:
    def test_shifted_distributions_detected(self) -> None:
        rng = np.random.default_rng(SEED)
        a = rng.normal(1.0, 1.0, 300)
        b = rng.normal(0.0, 1.0, 300)
        rep = mannwhitney_reported(a, b, "shifted", seed=SEED)
        assert rep.p_value < 1e-6
        assert rep.coef == pytest.approx(1.0, abs=0.3)
        assert rep.ci_low < rep.coef < rep.ci_high
        assert "Cliff's delta" in rep.name

    def test_identical_distributions_null(self) -> None:
        rng = np.random.default_rng(SEED)
        pooled = rng.normal(0, 1, 600)
        rep = mannwhitney_reported(pooled[:300], pooled[300:], "same", seed=SEED)
        assert rep.p_value > 0.05
        assert abs(cliffs_delta(pooled[:300], pooled[300:])) < 0.1

    def test_nan_dropped(self) -> None:
        a = np.array([1.0, 2.0, np.nan, 3.0])
        b = np.array([0.0, np.nan, 1.0])
        rep = mannwhitney_reported(a, b, "nans", seed=SEED)
        assert rep.n_obs == 5


class TestNestedFTest:
    def test_real_predictor_significant(self, linear_data: pd.DataFrame) -> None:
        fit_r, _ = fit_reported("y ~ 1", linear_data, seed=SEED)
        fit_f, _ = fit_reported("y ~ x", linear_data, seed=SEED)
        f_stat, p = nested_f_test(fit_r, fit_f)
        assert f_stat > 100
        assert p < 1e-10

    def test_noise_predictor_null(self, linear_data: pd.DataFrame) -> None:
        rng = np.random.default_rng(7)  # seed chosen once; test is deterministic
        df = linear_data.assign(noise=rng.normal(size=len(linear_data)))
        fit_r, _ = fit_reported("y ~ x", df, seed=SEED)
        fit_f, _ = fit_reported("y ~ x + noise", df, seed=SEED)
        _, p = nested_f_test(fit_r, fit_f)
        assert p > 0.05
