"""ingest + clean against the committed synthetic fixture (§8 test list)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.clean import OUTSOURCED_BINDING, CleanResult, clean
from src.config import load_config
from src.ingest import IngestError, ValidationReport, count_error_cells, load_raw

FIXTURE = Path(__file__).resolve().parents[1] / "data" / "sample" / "sample.xlsx"


@pytest.fixture(scope="module")
def cfg() -> dict:
    return load_config()


@pytest.fixture(scope="module")
def loaded() -> tuple[pd.DataFrame, ValidationReport]:
    return load_raw(FIXTURE)


@pytest.fixture(scope="module")
def cleaned(loaded: tuple[pd.DataFrame, ValidationReport], cfg: dict) -> CleanResult:
    raw, _ = loaded
    return clean(raw, cfg)


class TestIngest:
    def test_report_counts(self, loaded: tuple[pd.DataFrame, ValidationReport]) -> None:
        raw, report = loaded
        assert report.n_rows == 400
        assert report.n_customers == 12
        assert report.n_reps == 3
        assert report.schema_ok

    def test_both_identities_hold(self, loaded: tuple[pd.DataFrame, ValidationReport]) -> None:
        _, report = loaded
        assert report.identity1_max_err < 1e-8
        assert report.identity2_max_err < 1e-8
        assert report.identity2_ok

    def test_undocumented_nulls_counted(
        self, loaded: tuple[pd.DataFrame, ValidationReport]
    ) -> None:
        # real export: manadj/mupnett null x64, Puchases null x12 — fixture plants 5 and 2
        _, report = loaded
        assert report.n_null_manadj == 5
        assert report.n_null_purchases == 2
        assert report.n_identity2_checked == report.n_rows - 5

    def test_error_cells_counted_before_pandas(self) -> None:
        # the fixture writes 8 '#DIV/0!' as native error cells — pandas sees NaN
        assert count_error_cells(FIXTURE, "VA%") == 8

    def test_broken_identity2_flagged_not_raised(
        self, loaded: tuple[pd.DataFrame, ValidationReport], tmp_path: Path
    ) -> None:
        # §5.4: pricing refuses; ingest must NOT kill the whole pipeline
        raw, _ = loaded
        broken = raw.copy()
        broken.loc[broken.index[0], "mupnett"] += 5.0
        out = tmp_path / "broken.xlsx"
        with pd.ExcelWriter(out) as xl:
            broken.to_excel(xl, sheet_name="Master Plain (Anon)", index=False)
        _, report = load_raw(out)
        assert not report.identity2_ok
        assert report.identity2_max_err == pytest.approx(5.0)

    def test_missing_column_raises(
        self, loaded: tuple[pd.DataFrame, ValidationReport], tmp_path: Path
    ) -> None:
        raw, _ = loaded
        out = tmp_path / "short.xlsx"
        with pd.ExcelWriter(out) as xl:
            raw.drop(columns=["manadj"]).to_excel(xl, sheet_name="Master Plain (Anon)", index=False)
        with pytest.raises(IngestError, match="manadj"):
            load_raw(out)


class TestClean:
    def test_fx_keys_off_currency_never_region(self, cleaned: CleanResult, cfg: dict) -> None:
        jobs = pd.concat([cleaned.jobs, cleaned.credits])
        rate = float(cfg["fx"]["default_eur_per_gbp"])
        euro = jobs[jobs["currency"] == "Euro"]
        stg = jobs[jobs["currency"] == "Stg"]
        assert np.allclose(euro["va_amount_gbp"], euro["va_amount"] / rate)
        assert np.allclose(stg["va_amount_gbp"], stg["va_amount"])
        # the trap itself: Ireland-Stg rows must NOT be converted
        ie_stg = jobs[(jobs["region"] == "Ireland") & (jobs["currency"] == "Stg")]
        assert len(ie_stg) > 0, "fixture must contain the Ireland-Stg trap"
        assert np.allclose(ie_stg["va_amount_gbp"], ie_stg["va_amount"])

    def test_monthly_fx_override_wins(self, loaded: tuple, cfg: dict) -> None:
        raw, _ = loaded
        cfg2 = {**cfg, "fx": {"default_eur_per_gbp": 1.17, "monthly": {"2024-03": 2.0}}}
        res = clean(raw, cfg2)
        jobs = pd.concat([res.jobs, res.credits])
        month = jobs["sales_in"].dt.strftime("%Y-%m")
        mar = jobs[(jobs["currency"] == "Euro") & (month == "2024-03")]
        if len(mar):  # fixture has ~40 months; March-24 euro rows near-certain
            assert np.allclose(mar["va_amount_gbp"], mar["va_amount"] / 2.0)

    def test_canonicalisation_completeness(self, cleaned: CleanResult, cfg: dict) -> None:
        # §3.4: every mapped raw label collapses; canonical values stay put
        jobs = cleaned.jobs
        assert not set(jobs["product_type"]) & set(cfg["product_type_map"].keys())
        assert "Menu" in set(jobs["product_type"])
        # BPUK book categories must never be merged
        raws = set(pd.concat([cleaned.jobs, cleaned.credits])["product_type_raw"])
        if "BPUK Softback Book" in raws:
            assert "BPUK Softback Book" in set(jobs["product_type"]) | set(
                cleaned.credits["product_type"]
            )

    def test_quarantine_credits(self, cleaned: CleanResult) -> None:
        assert (cleaned.credits["sell_price"] <= 0).all()
        assert (cleaned.jobs["sell_price"] > 0).all()
        assert cleaned.report.n_quarantined_credits == 12  # fixture plants 12
        assert len(cleaned.jobs) + len(cleaned.credits) == 400  # nothing dropped

    def test_binding_null_recoded_not_imputed(self, cleaned: CleanResult) -> None:
        jobs = pd.concat([cleaned.jobs, cleaned.credits])
        assert jobs["binding_type"].notna().all()
        n_outsourced = (jobs["binding_type"] == OUTSOURCED_BINDING).sum()
        assert n_outsourced == cleaned.report.n_binding_recoded
        assert cleaned.report.n_binding_recoded > 0

    def test_divide_by_zero_paths(self, cleaned: CleanResult) -> None:
        jobs = cleaned.jobs
        digital = jobs[jobs["is_digital"]]
        assert digital["press_hrs_nz"].isna().all()  # 0 -> NaN, never inf
        assert digital["rate_gbp_per_hr"].isna().all()
        litho = jobs[~jobs["is_digital"] & jobs["press_hrs"].gt(0)]
        assert np.isfinite(litho["rate_gbp_per_hr"]).all()

    def test_partial_period_flagged(self, cleaned: CleanResult) -> None:
        assert cleaned.report.partial_year == 2026
        jobs = cleaned.jobs
        assert jobs.loc[jobs["year"] == 2026, "is_partial_period"].all()
        assert not jobs.loc[jobs["year"] < 2026, "is_partial_period"].any()

    def test_as_of_derives_from_data_not_now(self, cleaned: CleanResult) -> None:
        jobs = pd.concat([cleaned.jobs, cleaned.credits])
        assert cleaned.report.as_of == str(jobs["sales_in"].max().date())

    def test_dwell_null_safe_and_outliers_counted(self, cleaned: CleanResult) -> None:
        jobs = cleaned.jobs
        assert (jobs["dwell_days"].dropna() <= 400).all()
        null_ship = jobs["ship_date"].isna()
        assert jobs.loc[null_ship, "dwell_days"].isna().all()

    def test_puchases_renamed_only_in_clean(
        self, loaded: tuple[pd.DataFrame, ValidationReport], cleaned: CleanResult
    ) -> None:
        raw, _ = loaded
        assert "Puchases" in raw.columns  # read as-is
        assert "purchases" in cleaned.jobs.columns
        assert "Puchases" not in cleaned.jobs.columns
