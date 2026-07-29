"""FastAPI app (§7.1). Local only: uvicorn :8000, CORS for :3000.

/docs stays enabled — it is the fallback demo and a deliverable. Every
response body is a schema with all fields required; §1-excluded findings
travel inside caution/inconclusive/not_headline wrappers that the
frontend must render visibly.
"""

from __future__ import annotations

import dataclasses
import io
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from api import schemas, state
from src.call_list import build_call_list
from src.charts import CHARTS, build_chart
from src.gaps import gap_report
from src.ingest import IngestError
from src.pipeline import PipelineResult

app = FastAPI(
    title="wgb-insights API",
    description="Typed analytics over W&G Baird print-job sales data. "
    "No bare R2, no bare p-value can cross this boundary.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _validation(pr: PipelineResult) -> schemas.ValidationReportSchema:
    return schemas.ValidationReportSchema(**dataclasses.asdict(pr.validation))


def _clean(pr: PipelineResult) -> schemas.CleanReportSchema:
    return schemas.CleanReportSchema(**dataclasses.asdict(pr.clean_report))


def _gaps(pr: PipelineResult) -> list[schemas.GapSchema]:
    turnover = float(pr.config["company_turnover_gbp"])
    return [schemas.GapSchema(**g) for g in gap_report(pr.jobs, turnover)]


def _effect(e: Any) -> schemas.EffectReportSchema:
    return schemas.EffectReportSchema(**dataclasses.asdict(e))


@app.post("/datasets", response_model=schemas.DatasetResponse)
async def upload_dataset(file: UploadFile) -> schemas.DatasetResponse:
    """THE dynamic-system endpoint: a new .xlsx of the same schema fully
    refreshes every result with no code change."""
    data = await file.read()
    try:
        key, pr = state.ingest_bytes(data, file.filename or "upload.xlsx")
    except IngestError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return schemas.DatasetResponse(
        dataset_hash=key, validation=_validation(pr), clean_report=_clean(pr),
        gaps=_gaps(pr),
    )


@app.get("/overview", response_model=schemas.OverviewResponse)
def overview() -> schemas.OverviewResponse:
    pr = state.active()
    trend = [
        schemas.YearRow(
            year=int(y),
            revenue_gbp=float(r["revenue_gbp"]),
            contribution_gbp=float(r["contribution_gbp"]),
            va_margin_pct=float(r["va_margin_pct"]),
            jobs=int(r["jobs"]),
            active_customers=int(r["active_customers"]),
            revenue_per_job_gbp=float(r["revenue_per_job_gbp"]),
        )
        for y, r in pr.trend_yearly.iterrows()
    ]
    full = pr.jobs[~pr.jobs["is_partial_period"] & pr.jobs["is_closed"]]
    share = float(
        full.groupby("year")["sell_price_gbp"].sum().mean()
        / float(pr.config["company_turnover_gbp"])
    )
    return schemas.OverviewResponse(
        source_name=pr.source_name,
        as_of=pr.clean_report.as_of,
        seeds={k: int(v) for k, v in pr.config["seeds"].items()},
        trend=trend,
        partial_year=pr.clean_report.partial_year,
        growth={k: v for k, v in pr.trend_growth.items()},
        sample_share_of_turnover=share,
        scale_caveat=(
            f"This sample is ~{share:.0%} of stated turnover — no figure here "
            "extrapolates to company totals."
        ),
        validation=_validation(pr),
        clean_report=_clean(pr),
        gaps=_gaps(pr),
        hypothesis_register=[schemas.RegisterEntry(**e) for e in pr.register],
    )


@app.get("/decomposition", response_model=schemas.DecompositionResponse)
def decomposition() -> schemas.DecompositionResponse:
    pr = state.active()
    rows = []
    for r in pr.decomposition.to_dict("records"):
        f_p = r["f_p_vs_prev"]
        rows.append(
            schemas.DecompositionRow(
                **{**r, "f_p_vs_prev": None if pd.isna(f_p) else float(f_p)}
            )
        )
    naive = pr.rep_pair["naive"]
    return schemas.DecompositionResponse(
        target="log(contribution per constraint-hour), GBP, floor-clipped",
        rows=rows,
        rep_pair=schemas.RepPairSchema(
            naive=schemas.ModelReportSchema(**dataclasses.asdict(naive)),
            controlled_f_stat=float(pr.rep_pair["controlled_f_stat"]),
            controlled_f_p=float(pr.rep_pair["controlled_f_p"]),
            controlled_cv_increment=float(pr.rep_pair["controlled_cv_increment"]),
            controlled_adj_increment=float(pr.rep_pair["controlled_adj_increment"]),
            conclusion="Rep differences are customer mix — nothing survives controls.",
        ),
        order_note=(
            "Blocks enter in config order; increments are order-dependent "
            "(config order only, reversed run cut for budget)."
        ),
    )


@app.get("/pricing", response_model=schemas.PricingResponse)
def pricing() -> schemas.PricingResponse:
    pr = state.active()
    m = pr.pricing_model
    return schemas.PricingResponse(
        scale=pr.pricing_scale,
        model=schemas.OverrideModelSchema(
            **dataclasses.asdict(m) | {"top_features": list(m.top_features)},
            finding=(
                "Overrides are NOT learnable from quote-time features — the "
                "estimators use information the system doesn't capture. That is "
                "a data gap, not a modelling failure."
                if not m.beats_all_baselines
                else "Overrides are partially learnable from quote-time features."
            ),
        ),
        override_effect=schemas.CautionWrapped(
            caution=(
                "Correlational and selection-biased: overrides are applied to "
                "jobs chosen by humans. Survives BH under cluster-robust SEs "
                "but remains excluded from headlines and asset export by "
                "adjudication — the bias, not the p-value, is the problem."
            ),
            effect=_effect(pr.pricing_effect),
        ),
    )


@app.get("/thresholds", response_model=schemas.ThresholdsResponse)
def thresholds() -> schemas.ThresholdsResponse:
    pr = state.active()
    th = pr.thresholds
    sens = th["window_sensitivity"]["crossover_hrs"]
    cs = th["capacity_share"]
    return schemas.ThresholdsResponse(
        benchmark_rate_gbp_per_hr=float(th["benchmark_rate"]),
        crossover_hrs=float(th["crossover_hrs"]),
        crossover_window_range=(float(sens.min()), float(sens.max())),
        crossover_ci95=(float(th["crossover_ci"][0]), float(th["crossover_ci"][1])),
        monotonicity=th["monotonicity"],
        capacity_share={k: float(v) for k, v in cs.items()},
        capacity_statement=(
            f"{cs['share_of_constraint_hours']:.0%} of constraint-hours run at "
            f"{cs['pooled_rate_above']:,.0f} GBP/hr vs the factory's own average "
            f"of {cs['benchmark']:,.0f} GBP/hr. Descriptive only — no "
            "counterfactual GBP figure is defensible without capacity data."
        ),
        litho_only_note=(
            "Press hrs = 0 for Digital/Outwork/Wide Format: constraint analysis "
            "is Litho-only."
        ),
    )


@app.get("/rush", response_model=schemas.RushResponse)
def rush() -> schemas.RushResponse:
    pr = state.active()
    bh = pr.bh_table.set_index("name")
    passes = bool(bh.loc["rush_main_effect", "passes_bh"])
    inter = pr.rush_interaction
    return schemas.RushResponse(
        main_effect=_effect(pr.rush_effect),
        bh_status="headline" if passes else "not_headline",
        bh_note=(
            "Passes the family-wise BH correction."
            if passes
            else "Fails the family-wise BH correction (adjusted p "
            f"{pr.rush_effect.p_value_adj:.3f}) — reported as suggestive, "
            "excluded from headlines and exported assets by the system's own rule."
        ),
        percentile_sensitivity=pr.rush_sensitivity.to_dict("records"),
        interaction=schemas.InconclusiveWrapped(
            inconclusive=(
                "Interaction not established (p = "
                f"{inter['interaction'].p_value:.2f}). Consistent with queueing "
                "theory (Kingman/VUT), not established by this data. The "
                "descriptive load gradient may only ever appear next to this test."
            ),
            interaction=_effect(inter["interaction"]),
            simple_slopes=inter["simple_slopes"],
        ),
    )


@app.get("/churn", response_model=schemas.ChurnResponse)
def churn() -> schemas.ChurnResponse:
    pr = state.active()
    ccfg = pr.config["churn"]
    rows = []
    for cust, r in pr.churn_risk.iterrows():
        rows.append(
            schemas.ChurnRow(
                customer=str(cust),
                n_orders=int(r["n_orders"]),
                median_interval=None if pd.isna(r["median_interval"]) else float(
                    r["median_interval"]
                ),
                interval_cv=None if pd.isna(r["cv"]) else float(r["cv"]),
                gap_days=float(r["gap_days"]),
                gap_ratio=None if pd.isna(r["gap_ratio"]) else float(r["gap_ratio"]),
                forecastable=bool(r["forecastable"]),
                risk_band=str(r["risk_band"]),
                reason_code=str(r["reason_code"]),
                expected_next_order=(
                    None if pd.isna(r["expected_next_order"])
                    else str(pd.Timestamp(r["expected_next_order"]).date())
                ),
                at_risk_personalised=bool(r["at_risk_personalised"]),
            )
        )
    return schemas.ChurnResponse(
        as_of=pr.clean_report.as_of,
        gate=(
            f"Next-order prediction only where interval CV < {ccfg['cv_max']} and "
            f">= {ccfg['min_orders']} distinct order dates; others get a risk band "
            "and a reason, never an invented date."
        ),
        rows=rows,
        comparison=pr.churn_comparison,
    )


@app.get("/call-list.csv", response_class=PlainTextResponse)
def call_list_csv() -> str:
    pr = state.active()
    tol = float(pr.config["clean"]["override_tolerance_gbp"])
    df = build_call_list(pr.jobs, pr.churn_risk, tol)
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


@app.get("/register", response_model=schemas.RegisterResponse)
def register() -> schemas.RegisterResponse:
    pr = state.active()
    bh = pr.bh_table.replace({np.nan: None}).to_dict("records")
    return schemas.RegisterResponse(
        entries=[schemas.RegisterEntry(**e) for e in pr.register],
        bh_table=bh,
        currency_replication=pr.currency_replication,
        rush_percentile_sensitivity=pr.rush_sensitivity.to_dict("records"),
        window_sensitivity=pr.thresholds["window_sensitivity"].to_dict("records"),
    )


@app.get("/charts/{name}", response_class=PlainTextResponse)
def chart(name: str) -> str:
    """Plotly fig.to_json() — the frontend renders, never recomputes."""
    pr = state.active()
    try:
        fig = build_chart(name, pr)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return str(fig.to_json())


@app.get("/charts", response_model=list[str])
def chart_names() -> list[str]:
    return sorted(CHARTS)
