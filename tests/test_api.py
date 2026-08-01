"""One contract test per endpoint against the synthetic fixture (§8).

The TestClient boots state from data/sample/sample.xlsx when data/raw is
absent; in a checkout WITH real data present, state.active() would use
it, so tests pin the fixture explicitly via POST /datasets first.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.main import app

FIXTURE = Path(__file__).resolve().parents[1] / "data" / "sample" / "sample.xlsx"


@pytest.fixture(scope="module")
def client() -> TestClient:
    c = TestClient(app)
    with open(FIXTURE, "rb") as fh:
        resp = c.post(
            "/datasets",
            files={"file": ("sample.xlsx", fh,
                            "application/vnd.openxmlformats-officedocument"
                            ".spreadsheetml.sheet")},
        )
    assert resp.status_code == 200, resp.text
    return c


class TestDatasets:
    def test_upload_refreshes_everything(self, client: TestClient) -> None:
        with open(FIXTURE, "rb") as fh:
            resp = client.post("/datasets", files={"file": ("again.xlsx", fh, "x")})
        body = resp.json()
        assert body["validation"]["n_rows"] == 400
        assert body["clean_report"]["n_quarantined_credits"] == 12
        assert len(body["gaps"]) == 5

    def test_garbage_rejected_422(self, client: TestClient) -> None:
        import openpyxl

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Master Plain (Anon)"
        ws.append(["Wrong", "Columns"])
        import io

        buf = io.BytesIO()
        wb.save(buf)
        resp = client.post("/datasets", files={"file": ("bad.xlsx", buf.getvalue(), "x")})
        assert resp.status_code == 422
        assert "missing expected columns" in resp.json()["detail"]

    def test_no_bare_numbers_in_effect_reports(self, client: TestClient) -> None:
        # the structural guarantee: every effect carries CI, p, n together
        body = client.get("/rush").json()
        e = body["main_effect"]
        for field in ("coef", "ci_low", "ci_high", "p_value", "n_obs", "se_type"):
            assert field in e


class TestEndpoints:
    def test_overview(self, client: TestClient) -> None:
        body = client.get("/overview").json()
        assert body["as_of"]  # derived from max(SalesIn), never today
        assert body["partial_year"] == 2026
        assert len(body["hypothesis_register"]) == 13
        assert "extrapolat" in body["scale_caveat"]

    def test_decomposition(self, client: TestClient) -> None:
        body = client.get("/decomposition").json()
        blocks = [r["block"] for r in body["rows"]]
        assert blocks[:2] == ["size", "run_features"]
        first = body["rows"][0]
        assert {"r2", "r2_adj", "r2_cv", "n_params"} <= set(first)  # no bare R2
        assert body["rows"][0]["f_p_vs_prev"] is None  # first block: nothing to test

    def test_pricing_caution_wrapped(self, client: TestClient) -> None:
        body = client.get("/pricing").json()
        assert "selection-biased" in body["override_effect"]["caution"]
        assert body["model"]["finding"]
        assert "rate_by_tolerance_gbp" in body["scale"]

    def test_thresholds(self, client: TestClient) -> None:
        body = client.get("/thresholds").json()
        assert body["monotonicity"]["interior_optimum"] in (True, False)
        assert "Litho-only" in body["litho_only_note"]
        assert "no counterfactual" in body["capacity_statement"].lower()
        # the composition check ships as BOTH halves, full effect reports,
        # plus the board-readable per-doubling forms computed in Python
        for key in ("within_customer_size", "pooled_size"):
            e = body[key]
            assert e["ci_low"] < e["coef"] < e["ci_high"]
            assert "cluster-robust" in e["se_type"]
        assert isinstance(body["within_customer_pct_per_doubling"], float)
        assert isinstance(body["pooled_pct_per_doubling"], float)
        assert "customer mix" in body["size_mix_statement"]
        lo, hi = body["share_range_across_crossover_ci"]
        assert lo <= hi  # headline share evaluated at the CI bounds

    def test_rush_interaction_inconclusive_wrapped(self, client: TestClient) -> None:
        body = client.get("/rush").json()
        assert body["bh_status"] in ("headline", "not_headline")
        assert "queueing theory" in body["interaction"]["inconclusive"]

    def test_churn_gate_and_null_dates(self, client: TestClient) -> None:
        body = client.get("/churn").json()
        assert "never an invented date" in body["gate"]
        for row in body["rows"]:
            if not row["forecastable"]:
                assert row["expected_next_order"] is None

    def test_churn_backtest_ships_with_counts(self, client: TestClient) -> None:
        # the rules are scored against a held-out outcome, and the counts
        # always travel with the rates (outcome n is small by nature)
        bt = client.get("/churn").json()["backtest"]
        assert bt["holdout_days"] > 0 and bt["n_accounts"] > 0
        for rule in ("personalised", "fixed"):
            score = bt[rule]
            assert {"n_flagged", "n_caught", "precision", "recall"} <= set(score)
            assert score["n_caught"] <= bt["n_went_quiet"] or bt["n_went_quiet"] == 0

    def test_churn_bands_match_headline_rule(self, client: TestClient) -> None:
        # ONE at-risk rule: the accounts wearing a non-normal band must be
        # exactly the accounts the personalised headline count flags. A
        # count of 13 with 12 flagged rows on screen was a real defect.
        body = client.get("/churn").json()
        flagged_rows = [r for r in body["rows"] if r["risk_band"] != "normal"]
        assert len(flagged_rows) == body["comparison"]["n_personalised"]

    def test_call_list_csv(self, client: TestClient) -> None:
        resp = client.get("/call-list.csv")
        header = resp.text.splitlines()[0].split(",")
        assert header == [
            "customer", "rep", "industry", "last_order", "days_since",
            "own_median_interval", "interval_cv", "forecastable", "gap_ratio",
            "historic_contribution_gbp", "contribution_per_constraint_hr",
            "override_rate", "risk_band", "reason_code", "expected_next_order",
        ]

    def test_value_rankings(self, client: TestClient) -> None:
        body = client.get("/value").json()
        assert body["top_customers"] and body["work_types"]
        tops = [r["contribution_gbp"] for r in body["top_customers"]]
        assert tops == sorted(tops, reverse=True)
        assert "cost-to-serve" in body["caveat"]
        for r in body["work_types"]:
            # no bare share without its base counts
            assert {"jobs", "revenue_gbp", "share_of_contribution"} <= set(r)

    def test_call_list_json_matches_csv(self, client: TestClient) -> None:
        rows = client.get("/call-list").json()["rows"]
        csv_lines = client.get("/call-list.csv").text.strip().splitlines()
        assert len(rows) == len(csv_lines) - 1  # same builder, same rows
        for row in rows:
            if not row["forecastable"]:
                assert row["expected_next_order"] is None

    def test_register(self, client: TestClient) -> None:
        body = client.get("/register").json()
        assert len(body["bh_table"]) == 7
        outcomes = {e["id"]: e["outcome"] for e in body["entries"]}
        assert outcomes["optimal_job_size_exists"] == "rejected"  # negative = deliverable

    def test_charts_render_and_404(self, client: TestClient) -> None:
        names = client.get("/charts").json()
        assert "rate_curve" in names and "bh_family" in names
        fig = json.loads(client.get("/charts/rate_curve").text)
        assert "data" in fig and "layout" in fig
        assert client.get("/charts/nonsense").status_code == 404

    def test_chart_fills_stay_monochrome(self, client: TestClient) -> None:
        # Tender Assistant treatment: yellow is the uniform brand OUTLINE
        # and the CI band, never a data fill, so removing it changes no
        # reading. Category identity must live in the charcoal/grey fills.
        for name in client.get("/charts").json():
            fig = json.loads(client.get(f"/charts/{name}").text)
            for trace in fig["data"]:
                marker = trace.get("marker") or {}
                fill = marker.get("color")
                fills = fill if isinstance(fill, list) else [fill]
                for c in fills:
                    if isinstance(c, str):
                        assert c.upper() != "#FFE600", f"{name}: yellow fill"

    def test_chart_year_slice(self, client: TestClient) -> None:
        sliced = json.loads(client.get("/charts/override_scale?year=2024").text)
        title = sliced["layout"]["title"]["text"]
        assert "2024" in title  # the slice names its scope in the figure
        assert "GBP/yr" in title  # a full year is annualised as normal
        # model-backed charts refuse a slice rather than faking one
        assert client.get("/charts/rate_curve?year=2024").status_code == 404
        assert client.get("/charts/override_scale?year=1999").status_code == 404

    def test_partial_year_slice_never_annualised(self, client: TestClient) -> None:
        # Slicing to the incomplete final year must show the observed net
        # with an explicit partial label: annualising five months by ~x2.6
        # would be exactly the extrapolation the scope bans.
        partial = json.loads(client.get("/charts/override_scale?year=2026").text)
        title = partial["layout"]["title"]["text"]
        assert "observed" in title and "GBP/yr" not in title
        assert "partial" in title
        shares = json.loads(client.get("/charts/capacity_share?year=2026").text)
        assert "partial" in shares["layout"]["title"]["text"]

    def test_effect_cis_ship_on_pct_scale(self, client: TestClient) -> None:
        # No client may transform a bound: the API ships CI bounds already
        # back-transformed to the % scale, everywhere an effect appears.
        rush = client.get("/rush").json()
        me = rush["main_effect"]
        assert me["ci_low_pct"] is not None and me["ci_high_pct"] is not None
        assert me["ci_low_pct"] < me["pct_effect"] < me["ci_high_pct"]
        for row in rush["percentile_sensitivity"]:
            assert "ci_low_pct" in row and "ci_high_pct" in row
        for slope in rush["interaction"]["simple_slopes"]:
            assert "ci_low_pct" in slope and "ci_high_pct" in slope
