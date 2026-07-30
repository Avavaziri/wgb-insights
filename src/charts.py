"""Named Plotly figures (§12) — built in Python, shipped as fig.to_json().

The frontend renders these verbatim (react-plotly.js); export_assets.py
writes the same figures to PNG. No chart logic exists anywhere else.

Brand system: the W&G Baird *web* design system, so structure is --ink
#3F454D and true black is reserved for the masthead and wordmark — the
figures sit inside the app and must not be a harder black than the page
around them. One yellow #FFE600, white ground, flat.
Chart adaptation per the dataviz method: a monochrome brand cannot pass
multi-hue categorical checks (black/grey carry zero chroma by design),
so every figure holds to <=2 series with the black+yellow pair (CVD
dE 32 — passes), 1px black outlines on yellow fills, and direct ink
labels — the documented secondary-encoding relief. Yellow is never used
for unoutlined thin marks (1.23:1 contrast vs white).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import numpy as np
import plotly.graph_objects as go

if TYPE_CHECKING:  # pipeline imports charts nowhere; avoid cycles
    from src.pipeline import PipelineResult

YELLOW = "#FFE600"
INK = "#3F454D"      # web system: charcoal, not true black
MUTED = "#555555"    # captions and helper text only
GRID = "#E6E6E6"
PARTIAL = "#D9D9D9"

# Inter is the app's UI face; kaleido falls back to Arial when rendering the
# PNGs on a box without it, and the frontend passes the resolved family
# through so the web view matches the page exactly.
_FONT = "Inter, Arial, Helvetica, sans-serif"

_LAYOUT: dict[str, Any] = {
    "font": {"family": _FONT, "color": INK, "size": 16},
    # title pinned to the container top so paper-space subtitle
    # annotations (y ~ 1.04) never collide with it
    "title": {
        "font": {"family": _FONT, "size": 22, "weight": 700},
        "x": 0.02, "y": 0.98, "yref": "container", "yanchor": "top",
    },
    "paper_bgcolor": "#FFFFFF",
    "plot_bgcolor": "#FFFFFF",
    "xaxis": {"gridcolor": GRID, "zerolinecolor": GRID, "linecolor": INK},
    "yaxis": {"gridcolor": GRID, "zerolinecolor": GRID, "linecolor": INK},
    "margin": {"l": 80, "r": 60, "t": 130, "b": 70},
    "showlegend": False,
}


def _fig(title: str, **layout: Any) -> go.Figure:
    fig = go.Figure()
    merged = {**_LAYOUT, **layout, "title": {**_LAYOUT["title"], "text": title}}
    fig.update_layout(**merged)
    return fig


def trend_context(pr: PipelineResult) -> go.Figure:
    """Asset 1: revenue by full year, partial 2026 greyed; margin labelled
    directly (one axis — margin rides as text, not a second scale)."""
    t = pr.trend_yearly
    partial_year = pr.clean_report.partial_year
    partial_rev = (
        pr.jobs[pr.jobs["is_partial_period"] & pr.jobs["is_closed"]]["sell_price_gbp"].sum()
    )
    years = [*t.index.astype(str)] + ([f"{partial_year} (partial)"] if partial_year else [])
    revenue = [*(t["revenue_gbp"] / 1e6)] + ([partial_rev / 1e6] if partial_year else [])
    colors = [INK] * len(t) + ([PARTIAL] if partial_year else [])
    labels = [
        f"£{r:.2f}m<br>VA {m:.1f}%"
        for r, m in zip(t["revenue_gbp"] / 1e6, t["va_margin_pct"], strict=True)
    ] + ([f"£{partial_rev / 1e6:.2f}m<br>to {pr.clean_report.as_of}"] if partial_year else [])

    fig = _fig("Growth is value per job, not volume")
    fig.add_bar(x=years, y=revenue, marker={"color": colors}, text=labels,
                textposition="outside", textfont={"size": 14})
    g = pr.trend_growth
    fig.add_annotation(
        text=(f"Revenue CAGR {g['revenue_cagr']:.1%} = jobs {g['jobs_cagr']:+.1%} "
              f"x value/job {g['revenue_per_job_cagr']:+.1%}  ·  "
              f"customers {g['customers_first']} -> {g['customers_last']}"),
        xref="paper", yref="paper", x=0.02, y=1.06, showarrow=False,
        font={"size": 15, "color": MUTED}, align="left",
    )
    fig.update_yaxes(title="Revenue (GBP m, sample)", rangemode="tozero")
    return fig


def decomposition_table(pr: PipelineResult) -> go.Figure:
    """Asset 2: the four-R2-column table, in_sample_only rows marked."""
    d = pr.decomposition
    mark = ["  <- in-sample only" if f else "" for f in d["in_sample_only"]]
    fig = go.Figure(
        go.Table(
            header={
                "values": ["Block (cumulative)", "R2", "adj R2", "CV R2",
                           "CV increment", "params", "nested F p"],
                "fill_color": INK, "font": {"color": "#FFFFFF", "size": 16},
                "align": "left", "height": 34,
            },
            cells={
                "values": [
                    [f"+ {b}{m}" for b, m in zip(d["block"], mark, strict=False)],
                    [f"{v:.3f}" for v in d["r2"]],
                    [f"{v:.3f}" for v in d["r2_adj"]],
                    [f"{v:.3f}" for v in d["r2_cv"]],
                    [f"{v:+.3f}" for v in d["cv_increment"]],
                    [str(int(v)) for v in d["n_params"]],
                    ["-"] + [f"{v:.2g}" for v in d["f_p_vs_prev"][1:]],
                ],
                "fill_color": [
                    [YELLOW if f else "#FFFFFF" for f in d["in_sample_only"]]
                ],
                "align": "left", "height": 30, "font": {"size": 15},
            },
        )
    )
    fig.update_layout(
        **{**_LAYOUT, "title": {**_LAYOUT["title"],
                                "text": "Where margin lives: nested decomposition "
                                        "(log contribution per constraint-hour)"}}
    )
    return fig


def rep_confounding(pr: PipelineResult) -> go.Figure:
    """Asset 3: what a naive rep dashboard shows vs what survives controls."""
    naive = pr.rep_pair["naive"]
    fig = _fig("The rep league table the data invites, and refuses")
    fig.add_bar(
        x=["Naive: rate ~ rep alone", "Controlled: rep added last"],
        y=[max(naive.r2_cv, 0.0), max(pr.rep_pair["controlled_cv_increment"], 0.0)],
        marker={"color": [INK, YELLOW], "line": {"color": INK, "width": 1}},
        text=[
            f"CV R2 {naive.r2_cv:.3f}",
            f"CV gain {pr.rep_pair['controlled_cv_increment']:+.3f}, "
            f"F p = {pr.rep_pair['controlled_f_p']:.2f}",
        ],
        textposition="outside", textfont={"size": 15},
    )
    fig.add_annotation(
        text="Rep differences are customer-mix, not salesmanship: a rep dashboard "
             "built on this data would mislead.",
        xref="paper", yref="paper", x=0.02, y=1.06, showarrow=False,
        font={"size": 15, "color": MUTED}, align="left",
    )
    fig.update_yaxes(title="Out-of-sample R2", rangemode="tozero")
    return fig


def override_scale(pr: PipelineResult) -> go.Figure:
    """Asset 4: override rate, direction split, net GBP/yr."""
    s = pr.pricing_scale
    fig = _fig(
        f"{s['override_rate']:.0%} of jobs are manually re-priced "
        f"(net {s['net_gbp_per_year'] / 1000:+,.0f}k GBP/yr)"
    )
    fig.add_bar(
        x=["Priced up", "Priced down"],
        y=[s["n_up"], s["n_down"]],
        marker={"color": [INK, YELLOW], "line": {"color": INK, "width": 1}},
        text=[f"{s['n_up']:,} jobs", f"{s['n_down']:,} jobs"],
        textposition="outside", textfont={"size": 16},
    )
    sens = " · ".join(
        f">{t:g} GBP: {r:.0%}" for t, r in s["rate_by_tolerance_gbp"].items()
    )
    fig.add_annotation(
        text=f"Override = |manadj| > {s['tolerance_gbp']:g} GBP. Sensitivity: {sens}",
        xref="paper", yref="paper", x=0.02, y=1.06, showarrow=False,
        font={"size": 14, "color": MUTED}, align="left",
    )
    fig.update_yaxes(title="Jobs (Litho constraint frame)", rangemode="tozero")
    return fig


def rate_curve(pr: PipelineResult) -> go.Figure:
    """Asset 5: the §5.3 curve — benchmark, crossover + CI band, monotone
    decline visible. The centrepiece chart."""
    th = pr.thresholds
    curve = th["curve"]
    ci_lo, ci_hi = th["crossover_ci"]
    bench = th["benchmark_rate"]
    xover = th["crossover_hrs"]
    sens = th["window_sensitivity"]["crossover_hrs"]

    fig = _fig("Contribution per press-hour declines with job size: no optimal size exists")
    # Plotly log-axis quirk (verified by rendering): SHAPES take raw data
    # coords, ANNOTATIONS take log10 coords. Mixing them up either blows
    # the axis out to 10^50 or parks the marker at 0.6h.
    log10 = np.log10
    fig.add_shape(  # bootstrap CI band on the crossover
        type="rect", x0=ci_lo, x1=ci_hi, y0=0, y1=1, yref="paper",
        fillcolor=YELLOW, opacity=0.45, line={"width": 0},
    )
    fig.add_trace(
        go.Scatter(x=curve["size_hrs"], y=curve["rate"], mode="lines",
                   line={"color": INK, "width": 3}, name="pooled rate")
    )
    fig.add_hline(y=bench, line={"color": MUTED, "width": 2, "dash": "dash"})
    fig.add_shape(
        type="line", x0=xover, x1=xover, y0=0, y1=1, yref="paper",
        line={"color": INK, "width": 2, "dash": "dot"},
    )
    fig.add_annotation(x=log10(xover), y=1.02, yref="paper", showarrow=False,
                       text=f"crossover {xover:.1f}h "
                            f"(windows {sens.min():.1f}-{sens.max():.1f}, "
                            f"95% CI {ci_lo:.1f}-{ci_hi:.1f})",
                       font={"size": 15})
    fig.add_annotation(x=0.99, xref="paper", y=bench, xanchor="right",
                       yanchor="bottom", showarrow=False,
                       text=f"factory average {bench:,.0f} GBP/hr",
                       font={"size": 15, "color": MUTED})
    fig.update_xaxes(title="Job size (press hours, log scale)", type="log")
    fig.update_yaxes(title="Contribution per constraint-hour (GBP)", rangemode="tozero")
    return fig


def capacity_share(pr: PipelineResult) -> go.Figure:
    """Asset 6: descriptive form ONLY — capacity share at rate X vs
    benchmark Y. No counterfactual GBP figure exists anywhere."""
    cs = pr.thresholds["capacity_share"]
    xover = pr.thresholds["crossover_hrs"]
    share_above = cs["share_of_constraint_hours"]
    below_rate = pr.constraint[pr.constraint["press_hrs"] <= xover]
    rate_below = below_rate["va_amount_gbp"].sum() / below_rate["press_hrs"].sum()

    fig = _fig(
        f"{share_above:.0%} of press capacity runs below the factory's own average rate"
    )
    fig.add_bar(
        x=[f"Jobs <= {xover:.1f}h", f"Jobs > {xover:.1f}h"],
        y=[1 - share_above, share_above],
        marker={"color": [INK, YELLOW], "line": {"color": INK, "width": 1}},
        text=[
            f"{1 - share_above:.0%} of hours @ {rate_below:,.0f} GBP/hr",
            f"{share_above:.0%} of hours @ {cs['pooled_rate_above']:,.0f} GBP/hr",
        ],
        textposition="outside", textfont={"size": 16},
    )
    fig.add_annotation(
        text=f"Benchmark (hour-weighted factory average): {cs['benchmark']:,.0f} GBP/hr. "
             "Descriptive only: without capacity data, no displaced-work GBP figure "
             "is defensible.",
        xref="paper", yref="paper", x=0.02, y=1.06, showarrow=False,
        font={"size": 14, "color": MUTED}, align="left",
    )
    fig.update_yaxes(title="Share of constraint-hours", tickformat=".0%",
                     range=[0, max(share_above, 1 - share_above) * 1.25])
    return fig


def churn_comparison(pr: PipelineResult) -> go.Figure:
    """Asset 8: fixed 90-day rule vs personalised thresholds — different
    accounts, not just different counts."""
    c = pr.churn_comparison
    fig = _fig("A fixed 90-day rule watches the wrong accounts")
    fig.add_bar(
        x=["Both rules", "Only fixed 90-day", "Only personalised"],
        y=[len(c["both"]), len(c["only_fixed"]), len(c["only_personalised"])],
        marker={"color": [INK, PARTIAL, YELLOW], "line": {"color": INK, "width": 1}},
        text=[str(len(c["both"])), str(len(c["only_fixed"])), str(len(c["only_personalised"]))],
        textposition="outside", textfont={"size": 16},
    )
    fig.add_annotation(
        text=(f"Fixed rule: {c['n_fixed']} accounts. Personalised (own median x "
              f"(1 + 1.5 x own CV)): {c['n_personalised']}. Steady accounts gone "
              "quiet are caught months earlier; erratic accounts aren't flagged for noise."),
        xref="paper", yref="paper", x=0.02, y=1.06, showarrow=False,
        font={"size": 14, "color": MUTED}, align="left",
    )
    fig.update_yaxes(title="Accounts", rangemode="tozero")
    return fig


def bh_family(pr: PipelineResult) -> go.Figure:
    """Replaces the cut rush asset (adjudicated): the BH pass itself —
    the system demoting one of its own findings is the methodology story."""
    t = pr.bh_table.sort_values("rank")
    labels = {
        "customer_block": "Customer identity", "run_features_block": "Run features",
        "product_block": "Product type", "size_effect": "Job size",
        "rush_main_effect": "Rush penalty", "rush_load_interaction": "Rush x load",
        "override_effect": "Override effect",
    }
    names = [labels.get(n, n) for n in t["name"]]
    clipped = np.clip(t["p_adj"].to_numpy(), 1e-60, 1.0)

    fig = _fig("Seven claims went in; the correction let five out")
    fig.add_trace(
        go.Scatter(
            x=clipped, y=names, mode="markers+text",
            marker={
                "size": 16,
                "color": [YELLOW if not p else INK for p in t["passes_bh"]],
                "line": {"color": INK, "width": 1.5},
            },
            text=[f"adj p = {p:.3g}{'' if ok else ' (FAILS)'}  "
                  if p > 0.001 else f"  adj p = {p:.3g}"
                  for p, ok in zip(t["p_adj"], t["passes_bh"], strict=True)],
            # near-1 points hug the right edge — label those leftwards
            textposition=[
                "middle left" if p > 0.001 else "middle right" for p in t["p_adj"]
            ],
            textfont={"size": 14},
        )
    )
    # shapes: raw data coords; annotations: log10 coords (Plotly log-axis quirk)
    fig.add_shape(type="line", x0=0.05, x1=0.05, y0=0, y1=1, yref="paper",
                  line={"color": MUTED, "width": 2, "dash": "dash"})
    fig.add_annotation(x=float(np.log10(0.05)), y=1.04, yref="paper", showarrow=False,
                       text="alpha = 0.05", font={"size": 14, "color": MUTED})
    fig.update_xaxes(title="Benjamini-Hochberg adjusted p (log scale)", type="log",
                     range=[-62, 4], exponentformat="power", dtick=10)
    fig.update_yaxes(autorange="reversed")
    return fig


CHARTS: dict[str, Any] = {
    "trend_context": trend_context,
    "decomposition_table": decomposition_table,
    "rep_confounding": rep_confounding,
    "override_scale": override_scale,
    "rate_curve": rate_curve,
    "capacity_share": capacity_share,
    "churn_comparison": churn_comparison,
    "bh_family": bh_family,
}


def _scale_font(obj: Any, factor: float, floor: int = 9) -> None:
    """Multiply every font size found anywhere in `obj`, in place."""
    if isinstance(obj, dict):
        for key, val in obj.items():
            if key == "size" and isinstance(val, (int, float)):
                obj[key] = max(floor, round(val * factor))
            else:
                _scale_font(val, factor, floor)
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            _scale_font(item, factor, floor)


def to_compact(fig: go.Figure) -> go.Figure:
    """Dashboard-tile variant of a presentation figure.

    The named figures are laid out for 1920x1080 PNG export: 16px base type,
    a 22px title and a 130px top margin holding a paper-space subtitle. In a
    grid of ~240px tiles that geometry is unreadable, so this strips the
    chrome the tile itself provides (title, subtitle, legend), scales all
    type down and tightens the margins.

    Cosmetic only — no trace, axis range or annotation *value* is touched, so
    a tile and its full-size counterpart are the same figure. Python owns
    both, which is why this is here and not a CSS trick in the frontend.
    """
    small = go.Figure(fig)
    layout = small.layout.to_plotly_json()

    # The tile header replaces the in-figure title; paper-space annotations
    # (the subtitle takeaways, y > 1) have nowhere to live at this size.
    layout.pop("title", None)
    layout["annotations"] = [
        a
        for a in layout.get("annotations", [])
        if not (a.get("yref") == "paper" and float(a.get("y", 0)) > 1)
    ]
    _scale_font(layout, 0.68)
    _scale_font(layout.get("annotations", []), 1.0, floor=10)

    layout["margin"] = {"l": 46, "r": 14, "t": 10, "b": 34}
    layout["showlegend"] = False
    for axis in ("xaxis", "yaxis"):
        ax = dict(layout.get(axis) or {})
        ax["automargin"] = True
        layout[axis] = ax

    # Assign wholesale rather than update_layout(): Plotly merges array
    # containers by index, so passing a shorter `annotations` list updates
    # element 0 and leaves the rest in place instead of replacing them.
    small.layout = layout
    # Data-space text labels are sized for the poster too.
    for trace in small.data:
        tf = getattr(trace, "textfont", None)
        if tf is not None and tf.size:
            trace.textfont.size = max(9, round(float(tf.size) * 0.68))
    return small


def build_chart(name: str, pr: PipelineResult, *, compact: bool = False) -> go.Figure:
    if name not in CHARTS:
        raise KeyError(f"unknown chart {name!r}; available: {sorted(CHARTS)}")
    fig = CHARTS[name](pr)
    return to_compact(fig) if compact else fig
