"""Price overrides: scale (headline), effect (excluded), model (timeboxed).

`manadj` is interpretable as a GBP price override ONLY because
mupnett == labmup + manadj holds (§3.2). validate_override_identity
guards that; when it breaks on a new file this module refuses to report
rather than emit nonsense.

Status notes (§1, adjudicated):
- override_scale (rate, direction, net GBP/yr) is a headline.
- override_effect (B7) is computed and shown ONLY under a caution
  banner: correlational, selection-biased, fails BH — never a headline,
  never in exported assets.
- override_model is hard-capped (~0.25 day): one family, defaults, three
  mandatory baselines. A negative result ships as a finding — the
  estimators use information the system doesn't capture.

Rows with null manadj (64 in the real export) are excluded from all
override analysis and the count is reported — data, not absence.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import r2_score, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from src.stats_core import EffectReport, effect, fit_reported

IDENTITY_TOL = 1e-8


class OverrideIdentityError(RuntimeError):
    """mupnett != labmup + manadj — manadj is no longer a price override."""


@dataclass(frozen=True)
class OverrideModelReport:
    """Learnability of the override from quote-time features (§5.4)."""

    r2_cv_model: float
    r2_cv_baseline_zero: float
    r2_cv_baseline_customer_mean: float
    r2_cv_baseline_global_mean: float
    auc_direction: float  # up-vs-down among overridden jobs; 0.5 = coin flip
    n_obs: int
    n_clusters: int
    cv_folds: int
    model_family: str
    beats_all_baselines: bool
    top_features: tuple[str, ...]  # permutation importance, descending


def validate_override_identity(data: pd.DataFrame) -> None:
    """Raise unless mupnett == labmup + manadj on every complete row."""
    complete = data[["mupnett", "labmup", "manadj"]].dropna()
    err = float((complete["mupnett"] - (complete["labmup"] + complete["manadj"])).abs().max())
    if err >= IDENTITY_TOL:
        raise OverrideIdentityError(
            f"mupnett != labmup + manadj (max err {err:.2e}) — "
            "override analysis refuses to report on this file"
        )


def override_flags(data: pd.DataFrame, tolerance_gbp: float) -> pd.DataFrame:
    """Per-job override status. Columns: overridden (nullable bool — null
    manadj stays null, never imputed), direction (up/down/none),
    magnitude_gbp (signed)."""
    validate_override_identity(data)
    adj = data["manadj_gbp"]
    overridden = adj.abs() > tolerance_gbp
    overridden = overridden.where(adj.notna())
    direction = pd.Series(
        np.select(
            [adj.isna(), adj > tolerance_gbp, adj < -tolerance_gbp],
            ["unknown", "up", "down"],
            default="none",
        ),
        index=data.index,
    )
    return pd.DataFrame(
        {"overridden": overridden, "direction": direction, "magnitude_gbp": adj}
    )


def override_scale(data: pd.DataFrame, tolerance_gbp: float) -> dict[str, Any]:
    """The headline descriptive facts: how often, which way, how much per
    year. GBP throughout; annualised over the observed SalesIn span."""
    flags = override_flags(data, tolerance_gbp)
    known = flags.dropna(subset=["overridden"])
    span_years = (
        (data["sales_in"].max() - data["sales_in"].min()).days / 365.25
    )
    up = int((known["direction"] == "up").sum())
    down = int((known["direction"] == "down").sum())
    by_work_type = (
        pd.DataFrame({"overridden": known["overridden"], "wt": data.loc[known.index, "work_type"]})
        .groupby("wt")["overridden"]
        .mean()
        .to_dict()
    )
    # §2.5: the tolerance is a threshold → sensitivity travels with the rate
    sensitivity = {
        t: float((known["magnitude_gbp"].abs() > t).mean())
        for t in (0.5, tolerance_gbp, 2.0, 5.0)
    }
    return {
        "override_rate": float(known["overridden"].mean()),
        "n_overridden": int(known["overridden"].sum()),
        "n_up": up,
        "n_down": down,
        "n_unknown_manadj": int(flags["overridden"].isna().sum()),
        "gross_gbp_per_year": float(known["magnitude_gbp"].abs().sum() / span_years),
        "net_gbp_per_year": float(known["magnitude_gbp"].sum() / span_years),
        "override_rate_by_work_type": by_work_type,
        "rate_by_tolerance_gbp": sensitivity,
        "tolerance_gbp": float(tolerance_gbp),
        "span_years": float(span_years),
    }


def override_effect(
    data: pd.DataFrame, tolerance_gbp: float, *, seed: int
) -> EffectReport:
    """B7 — computed, NEVER a headline (§1): correlational, selection-
    biased, fails BH. Callers must wrap this in a caution object.

    Outcome: log contribution per constraint-hour on the constraint
    frame; controls: size, run features, product; cluster-robust on
    customer.
    """
    flags = override_flags(data, tolerance_gbp)
    df = data.assign(overridden=flags["overridden"]).dropna(subset=["overridden"])
    df["overridden"] = df["overridden"].astype(int)
    fit, _ = fit_reported(
        "log_rate ~ overridden + np.log(press_hrs) + np.log1p(quantity)"
        " + np.log1p(impressions) + plates + C(product_type)",
        df,
        cluster_on="customer_id",
        seed=seed,
    )
    return effect(fit, "overridden", logged_outcome=True)


_MODEL_NUMERIC = ["press_hrs", "quantity", "impressions", "plates"]
_MODEL_CATEGORICAL = [
    "product_type", "customer_id", "work_type", "binding_type", "currency", "region",
]


def _feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    x = df[_MODEL_NUMERIC + _MODEL_CATEGORICAL].copy()
    for c in _MODEL_NUMERIC:
        x[c] = np.log1p(x[c].fillna(0.0))
    return x


def override_model(
    data: pd.DataFrame, config: dict[str, Any], *, seed: int
) -> OverrideModelReport:
    """Timeboxed learnability test (§5.4). GroupKFold grouped on customer —
    plain KFold leaks account pricing patterns and is a defect. Baselines
    are mandatory; 'beats none of them' is a shippable finding."""
    validate_override_identity(data)
    df = data.dropna(subset=["manadj_gbp"]).copy()
    y = df["manadj_gbp"].to_numpy()
    groups = df["customer_id"].to_numpy()
    x = _feature_frame(df)
    folds = int(config["pricing"]["group_kfold_folds"])
    family = str(config["pricing"]["model_family"])

    prep = ColumnTransformer(
        [("cat", OneHotEncoder(handle_unknown="ignore"), _MODEL_CATEGORICAL)],
        remainder="passthrough",
    )
    reg = Pipeline([("prep", prep), ("model", Ridge())])  # defaults only, capped

    gkf = GroupKFold(n_splits=folds)
    pred = np.full(len(df), np.nan)
    pred_zero = np.zeros(len(df))
    pred_cust = np.full(len(df), np.nan)
    pred_global = np.full(len(df), np.nan)
    for train_idx, test_idx in gkf.split(x, y, groups):
        assert not set(groups[train_idx]) & set(groups[test_idx]), "customer leaked across folds"
        reg.fit(x.iloc[train_idx], y[train_idx])
        pred[test_idx] = reg.predict(x.iloc[test_idx])
        train_means = pd.Series(y[train_idx]).groupby(groups[train_idx]).mean()
        global_mean = float(y[train_idx].mean())
        pred_cust[test_idx] = [train_means.get(g, global_mean) for g in groups[test_idx]]
        pred_global[test_idx] = global_mean

    # direction: up vs down among overridden jobs, same grouping discipline
    tol = float(config["clean"]["override_tolerance_gbp"])
    over = df[df["manadj_gbp"].abs() > tol]
    y_dir = (over["manadj_gbp"] > 0).to_numpy().astype(int)
    x_dir = _feature_frame(over)
    g_dir = over["customer_id"].to_numpy()
    clf = Pipeline([("prep", prep), ("model", LogisticRegression(max_iter=2000))])
    dir_pred = np.full(len(over), np.nan)
    for train_idx, test_idx in GroupKFold(n_splits=folds).split(x_dir, y_dir, g_dir):
        clf.fit(x_dir.iloc[train_idx], y_dir[train_idx])
        dir_pred[test_idx] = clf.predict_proba(x_dir.iloc[test_idx])[:, 1]
    auc = float(roc_auc_score(y_dir, dir_pred))

    # permutation importance on out-of-fold magnitude predictions, one pass
    rng = np.random.default_rng(seed)
    base_r2 = r2_score(y, pred)
    drops: dict[str, float] = {}
    last_train, last_test = list(gkf.split(x, y, groups))[-1]
    reg.fit(x.iloc[last_train], y[last_train])
    x_test, y_test = x.iloc[last_test].copy(), y[last_test]
    ref = r2_score(y_test, reg.predict(x_test))
    for col in x.columns:
        x_perm = x_test.copy()
        x_perm[col] = rng.permutation(x_perm[col].to_numpy())
        drops[col] = ref - r2_score(y_test, reg.predict(x_perm))
    top = tuple(sorted(drops, key=lambda c: drops[c], reverse=True)[:5])

    r2_model = float(base_r2)
    r2_zero = float(r2_score(y, pred_zero))
    r2_cust = float(r2_score(y, pred_cust))
    r2_global = float(r2_score(y, pred_global))
    return OverrideModelReport(
        r2_cv_model=r2_model,
        r2_cv_baseline_zero=r2_zero,
        r2_cv_baseline_customer_mean=r2_cust,
        r2_cv_baseline_global_mean=r2_global,
        auc_direction=auc,
        n_obs=int(len(df)),
        n_clusters=int(df["customer_id"].nunique()),
        cv_folds=folds,
        model_family=family,
        beats_all_baselines=bool(
            r2_model > max(r2_zero, r2_cust, r2_global) + 0.02
        ),
        top_features=top,
    )
