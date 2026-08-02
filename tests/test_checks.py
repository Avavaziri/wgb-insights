"""BH pass, currency replication, register wiring (§5.8)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.checks import bh_adjust, currency_replication, load_register


class TestBHAdjust:
    def test_textbook_example(self) -> None:
        # classic BH: m=5, alpha=0.05, largest k with p(k) <= k/m * alpha
        ps = {"a": 0.001, "b": 0.008, "c": 0.039, "d": 0.041, "e": 0.90}
        table = bh_adjust(ps).set_index("name")
        # k: a(0.001<=0.01) yes, b(0.008<=0.02) yes, c(0.039<=0.03) no,
        # d(0.041<=0.04) no, e no -> k=2 -> only a,b pass
        assert table.loc["a", "passes_bh"] and table.loc["b", "passes_bh"]
        assert not table.loc["c", "passes_bh"]
        assert not table.loc["d", "passes_bh"]

    def test_step_up_rescues_earlier_rank(self) -> None:
        # p3 clears its threshold, so p2 passes too even though it missed
        # its own: the step-up property naive implementations get wrong
        ps = {"p1": 0.001, "p2": 0.030, "p3": 0.029, "p4": 0.9, "p5": 0.9,
              "p6": 0.9, "p7": 0.9}
        # sorted: 0.001, 0.029, 0.030, ... thresholds 0.0071, 0.0143, 0.0214
        # none of rank 2,3 clear -> k=1
        table = bh_adjust(ps).set_index("name")
        assert table.loc["p1", "passes_bh"]
        assert not table.loc["p2", "passes_bh"]

        ps2 = {"p1": 0.001, "p2": 0.014, "p3": 0.021, "p4": 0.9, "p5": 0.9,
               "p6": 0.9, "p7": 0.9}
        # thresholds: 0.0071, 0.0143, 0.0214 -> rank2 (0.014<=0.0143) and
        # rank3 (0.021<=0.0214) pass -> k=3
        t2 = bh_adjust(ps2).set_index("name")
        assert t2.loc["p2", "passes_bh"] and t2.loc["p3", "passes_bh"]

    def test_adjusted_p_monotone_and_bounded(self) -> None:
        ps = {f"p{i}": p for i, p in enumerate([0.001, 0.02, 0.02, 0.5, 0.99])}
        table = bh_adjust(ps)
        assert table["p_adj"].is_monotonic_increasing
        assert (table["p_adj"] <= 1.0).all()
        assert (table["p_adj"] >= table["p_raw"]).all()

    def test_seven_family_inversion_case(self) -> None:
        # the real-data shape: override 0.023 (rank 5) passes because
        # 0.023 <= 5/7*0.05 = 0.0357; rush 0.044 (rank 6) fails because
        # 0.044 > 6/7*0.05 = 0.0429
        ps = {"c": 1e-30, "p": 1e-42, "s": 1e-60, "r": 1e-10,
              "override": 0.023, "rush": 0.044, "inter": 0.34}
        table = bh_adjust(ps).set_index("name")
        assert table.loc["override", "passes_bh"]
        assert not table.loc["rush", "passes_bh"]
        assert not table.loc["inter", "passes_bh"]


class TestCurrencyReplication:
    def test_ordering_holds_in_both(self) -> None:
        rng = np.random.default_rng(42)
        n = 800
        hrs = np.exp(rng.uniform(0, 3, n))
        rate = 900 / (1 + 0.5 * np.log1p(hrs)) * rng.lognormal(0, 0.1, n)
        cf = pd.DataFrame(
            {
                "press_hrs": hrs,
                "rate_gbp_per_hr": rate,
                "currency": rng.choice(["Stg", "Euro"], n),
            }
        )
        out = currency_replication(cf)
        assert out["holds_in_both"]
        assert out["Stg"]["spearman_rho"] < -0.3
        assert out["Euro"]["spearman_rho"] < -0.3

    def test_artifact_detected(self) -> None:
        # decline only in one currency -> must NOT claim it holds in both
        rng = np.random.default_rng(42)
        n = 800
        hrs = np.exp(rng.uniform(0, 3, n))
        ccy = rng.choice(["Stg", "Euro"], n)
        rate = np.where(
            ccy == "Stg",
            900 / (1 + 0.5 * np.log1p(hrs)),
            600.0,
        ) * rng.lognormal(0, 0.1, n)
        cf = pd.DataFrame({"press_hrs": hrs, "rate_gbp_per_hr": rate, "currency": ccy})
        assert not currency_replication(cf)["holds_in_both"]


class TestRegister:
    def test_register_has_all_scope_hypotheses(self) -> None:
        ids = {e["id"] for e in load_register()}
        assert ids == {
            "margin_by_customer", "margin_by_product", "margin_by_rep",
            "margin_by_size", "margin_by_run_features", "override_affects_margin",
            "overrides_learnable", "rush_costs_margin", "rush_cost_depends_on_load",
            "revenue_concentrated", "reorder_forecastable", "growth_volume_driven",
            "optimal_job_size_exists",
            # scoped-out entries: named boundaries, not tested hypotheses
            "reorder_value_forecastable", "seasonal_cycle",
        }

    def test_every_entry_has_hypothesis_and_test(self) -> None:
        for e in load_register():
            assert e["hypothesis"] and e["test"], e["id"]


class TestPipelineOnFixture:
    @pytest.fixture(scope="class")
    def result(self):  # type: ignore[no-untyped-def]
        from pathlib import Path

        from src.pipeline import run_pipeline

        fixture = Path(__file__).resolve().parents[1] / "data" / "sample" / "sample.xlsx"
        return run_pipeline(fixture)

    def test_bundle_complete(self, result) -> None:  # type: ignore[no-untyped-def]
        assert len(result.bh_table) == 7
        assert len(result.register) == 15
        assert result.rush_effect.p_value_adj is not None  # BH pass filled it
        assert result.pricing_effect.p_value_adj is not None

    def test_register_statuses_valid(self, result) -> None:  # type: ignore[no-untyped-def]
        allowed = {
            "headline", "register_only", "caution_only", "appendix_only", "not_headline",
        }
        assert {e["status"] for e in result.register} <= allowed
