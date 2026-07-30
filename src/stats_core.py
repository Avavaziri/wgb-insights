"""Statistical primitives enforcing §2 reporting standards structurally.

Every model result crosses the codebase as a ModelReport; every tested
effect as an EffectReport. All fields are required, so no caller can emit
a bare R² or a bare p-value — the dataclass constructor refuses.

Units: monetary coefficients are in GBP after FX conversion unless a
docstring says otherwise. Logged-outcome effects also carry a
back-transformed % effect ((exp(b) − 1) × 100).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
import scipy.stats
import statsmodels.formula.api as smf
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


@dataclass(frozen=True)
class ModelReport:
    """§2.1: R² never travels alone."""

    r2: float
    r2_adj: float
    r2_cv: float
    cv_folds: int
    n_params: int
    n_obs: int
    n_clusters: int | None
    formula: str


@dataclass(frozen=True)
class EffectReport:
    """§2.2: every effect ships size, CI, p and n together.

    pct_effect is the back-transformed % effect for logged outcomes,
    None otherwise. p_value_adj is filled by the single BH pass in
    checks.py and stays None until then.
    """

    name: str
    coef: float
    pct_effect: float | None
    ci_low: float
    ci_high: float
    p_value: float
    p_value_adj: float | None
    n_obs: int
    n_clusters: int | None
    se_type: str


_TERM_RE = re.compile(r"^(?:np\.)?(log1p|log)\((?P<col1>[^()]+)\)$|^C\((?P<col2>[^()]+)\)$")


def _parse_formula(formula: str) -> tuple[str, str | None, list[str], list[str]]:
    """Split a patsy-style formula into (target_col, target_transform,
    numeric_terms, categorical_cols) for the sklearn CV pipeline.

    Supported term forms: `col`, `np.log(col)`, `np.log1p(col)`, `C(col)`.
    Anything else raises — extend deliberately rather than guess.
    """
    lhs, rhs = (part.strip() for part in formula.split("~", 1))
    m = _TERM_RE.match(lhs)
    if m and m.group("col1"):
        target, target_tf = m.group("col1").strip(), m.group(1)
    else:
        target, target_tf = lhs, None

    numeric: list[str] = []
    categorical: list[str] = []
    for raw in rhs.split("+"):
        term = raw.strip()
        if term in {"1", "0", ""}:
            continue
        m = _TERM_RE.match(term)
        if m and m.group("col2"):
            categorical.append(m.group("col2").strip())
        elif m and m.group("col1"):
            numeric.append(term)  # keep the transform expression
        elif re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", term):
            numeric.append(term)
        elif re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*:[A-Za-z_][A-Za-z0-9_]*", term):
            numeric.append(term)  # numeric x numeric interaction
        else:
            raise ValueError(f"Unsupported formula term for CV parsing: {term!r}")
    return target, target_tf, numeric, categorical


def _apply_term(data: pd.DataFrame, term: str) -> pd.Series:
    """Evaluate a numeric term (`col`, `np.log(col)`, `np.log1p(col)`,
    `a:b` numeric interaction)."""
    m = _TERM_RE.match(term)
    if m and m.group("col1"):
        col = m.group("col1").strip()
        fn = np.log if m.group(1) == "log" else np.log1p
        return pd.Series(fn(data[col].to_numpy(dtype=float)), index=data.index, name=term)
    if ":" in term:
        left, right = term.split(":", 1)
        return (data[left].astype(float) * data[right].astype(float)).rename(term)
    return data[term].astype(float)


def cv_r2(
    data: pd.DataFrame,
    target: str,
    numeric: list[str],
    categorical: list[str],
    folds: int,
    seed: int,
) -> float:
    """Mean out-of-fold R² over KFold(shuffle=True, random_state=seed).

    One-hot encodes categoricals with handle_unknown='ignore' (§2.1), so a
    category present only in a test fold scores as zeros rather than
    crashing. `target` and `numeric` may be transform expressions
    (np.log(col)). Returns the mean of per-fold R² values.
    """
    y = _apply_term(data, target).to_numpy()
    x_parts = [_apply_term(data, t) for t in numeric]
    x_num = pd.concat(x_parts, axis=1) if x_parts else pd.DataFrame(index=data.index)
    x = pd.concat([x_num, data[categorical]], axis=1)
    x.columns = [str(c) for c in x.columns]

    transformers = []
    if categorical:
        transformers.append(
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=True), categorical)
        )
    intercept_only = x.shape[1] == 0
    pipe = Pipeline(
        [
            ("prep", ColumnTransformer(transformers, remainder="passthrough")),
            ("ols", LinearRegression()),
        ]
    )
    kf = KFold(n_splits=folds, shuffle=True, random_state=seed)
    scores: list[float] = []
    for train_idx, test_idx in kf.split(x if not intercept_only else y.reshape(-1, 1)):
        if intercept_only:
            pred = np.full(len(test_idx), y[train_idx].mean())
        else:
            pipe.fit(x.iloc[train_idx], y[train_idx])
            pred = pipe.predict(x.iloc[test_idx])
        y_test = y[test_idx]
        sse = float(np.sum((y_test - pred) ** 2))
        sst = float(np.sum((y_test - y_test.mean()) ** 2))
        scores.append(1.0 - sse / sst)
    return float(np.mean(scores))


def fit_reported(
    formula: str,
    data: pd.DataFrame,
    cluster_on: str | None = None,
    cv_folds: int = 5,
    seed: int | None = None,
) -> tuple[Any, ModelReport]:
    """OLS via statsmodels formula API with a complete ModelReport.

    cluster_on: column for cluster-robust SEs (§2.3 — customer for every
    job-level regression). CV R² comes from the sklearn pipeline in
    cv_r2(), parsed from the same formula, so in-sample and out-of-sample
    numbers always describe the same specification.
    """
    if seed is None:
        raise ValueError("seed is required: reproducibility is a §8 requirement")
    model = smf.ols(formula, data=data)
    if cluster_on is not None:
        n_clusters: int | None = int(data[cluster_on].nunique())
        fit = model.fit(cov_type="cluster", cov_kwds={"groups": data[cluster_on]})
        se_type = f"cluster-robust ({cluster_on}, {n_clusters} clusters)"
    else:
        n_clusters = None
        fit = model.fit()
        se_type = "nonrobust"
    # effect() needs these; statsmodels results don't expose them uniformly
    fit._wgb_se_type = se_type
    fit._wgb_n_clusters = n_clusters

    target, target_tf, numeric, categorical = _parse_formula(formula)
    target_expr = f"np.{target_tf}({target})" if target_tf else target
    r2_cv = cv_r2(data, target_expr, numeric, categorical, folds=cv_folds, seed=seed)

    report = ModelReport(
        r2=float(fit.rsquared),
        r2_adj=float(fit.rsquared_adj),
        r2_cv=r2_cv,
        cv_folds=cv_folds,
        n_params=int(fit.df_model) + 1,
        n_obs=int(fit.nobs),
        n_clusters=n_clusters,
        formula=formula,
    )
    return fit, report


def effect(fit: Any, term: str, logged_outcome: bool = True) -> EffectReport:
    """EffectReport for one regression term.

    pct_effect back-transforms log-outcome coefficients to a % effect;
    it is None when the outcome is not logged. p_value_adj stays None
    here — only the checks.py BH pass may fill it.
    """
    if term not in fit.params.index:
        raise KeyError(f"term {term!r} not in fitted model: {list(fit.params.index)}")
    coef = float(fit.params[term])
    ci = fit.conf_int().loc[term]
    return EffectReport(
        name=term,
        coef=coef,
        pct_effect=float((np.exp(coef) - 1.0) * 100.0) if logged_outcome else None,
        ci_low=float(ci[0]),
        ci_high=float(ci[1]),
        p_value=float(fit.pvalues[term]),
        p_value_adj=None,
        n_obs=int(fit.nobs),
        n_clusters=getattr(fit, "_wgb_n_clusters", None),
        se_type=getattr(fit, "_wgb_se_type", "unknown"),
    )


def cliffs_delta(a: np.ndarray, b: np.ndarray) -> float:
    """Cliff's delta via the Mann-Whitney U identity: d = 2U/(n_a·n_b) − 1."""
    u, _ = scipy.stats.mannwhitneyu(a, b, alternative="two-sided")
    return float(2.0 * u / (len(a) * len(b)) - 1.0)


def mannwhitney_reported(
    a: np.ndarray | pd.Series,
    b: np.ndarray | pd.Series,
    label: str,
    *,
    n_boot: int = 500,
    seed: int = 0,
) -> EffectReport:
    """Mann-Whitney U (§2.6, descriptive group differences) as an EffectReport.

    coef is the median difference (a − b, units of the input); the CI is a
    seeded bootstrap percentile interval on that median difference;
    effect size is Cliff's delta, encoded in the name for rendering.
    """
    a_arr = np.asarray(a, dtype=float)
    b_arr = np.asarray(b, dtype=float)
    a_arr = a_arr[~np.isnan(a_arr)]
    b_arr = b_arr[~np.isnan(b_arr)]
    _, p = scipy.stats.mannwhitneyu(a_arr, b_arr, alternative="two-sided")
    delta = cliffs_delta(a_arr, b_arr)
    med_diff = float(np.median(a_arr) - np.median(b_arr))

    rng = np.random.default_rng(seed)
    boots = np.empty(n_boot)
    for i in range(n_boot):
        boots[i] = np.median(rng.choice(a_arr, len(a_arr))) - np.median(
            rng.choice(b_arr, len(b_arr))
        )
    lo, hi = np.percentile(boots, [2.5, 97.5])

    return EffectReport(
        name=f"{label} (median diff; Cliff's delta={delta:.3f})",
        coef=med_diff,
        pct_effect=None,
        ci_low=float(lo),
        ci_high=float(hi),
        p_value=float(p),
        p_value_adj=None,
        n_obs=int(len(a_arr) + len(b_arr)),
        n_clusters=None,
        se_type=f"mannwhitney + bootstrap({n_boot}, seed={seed})",
    )


def nested_f_test(restricted: Any, full: Any) -> tuple[float, float]:
    """F-test of a restricted model against its superset. Returns (F, p).

    The classic F compares residual sums of squares, which is invalid on
    cluster-robust results objects — so both models are refit nonrobust
    here for the block test. Cluster-robust SEs still govern effect
    inference (§2.3); this F only asks whether a block moves the fit.

    §2.4 caveat applies downstream: in-sample F significance without a
    CV-R² increment is flagged in_sample_only by the caller.
    """
    restricted_ols = restricted.model.fit()
    full_ols = full.model.fit()
    if full_ols.df_model <= restricted_ols.df_model:
        # added block is collinear with what's already in the model
        # (e.g. a rep owning exactly one customer) — nothing to test
        return 0.0, 1.0
    f_stat, p_value, _ = full_ols.compare_f_test(restricted_ols)
    return float(f_stat), float(p_value)
