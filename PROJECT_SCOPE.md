# W&G Baird Sales Analytics — Final Scope (v3, adjudicated)

**This is the complete, final specification.** Build it start to finish in this order. The only work remaining after this scope is executed is the recorded video presentation, so §12 requires the system to export every presentation asset as a file.

**Deliverables:** (1) a public GitHub repo containing a dynamic Streamlit analytics system that fully refreshes when a new `.xlsx` of the same schema is uploaded; (2) exported charts, tables and a findings summary ready to paste into slides.

## Rules of engagement

- §2 analytical standards are a contract. Violations are defects.
- §9 values are **regression tests, not inputs**. Never hardcode them, never tune toward them. If a derived value disagrees materially, stop and flag it.
- Where this scope says a finding is **excluded from the presentation**, the code still computes it — exclusion is a communication decision, recorded in the register with its reason.
- Timeboxes in §11 are hard. When one expires, ship what exists and move on.

---

## 1. The narrative the system must support (adjudicated order)

1. **Context (B13, B14):** the business grew ~8.7%/yr (2023→2025) with flat job and customer counts — growth is value per job, not volume. This sample ≈54% of stated £15m turnover; no extrapolation.
2. **Headline 1 — pricing governance (B1, B5, B6):** margin is an account property (customer identity adds +0.20 cross-validated R²; product type adds ~nothing; rep adds nothing), and the automated price is manually overridden on 61% of jobs, net ≈ +£98k/yr of untracked human judgement.
3. **Headline 2 — the constraint (B4, A1-replacement, A4):** contribution per constraint-hour declines continuously with job size — no optimal size exists. Work above the derived crossover (~4.4h, report as a range with bootstrap CI) occupies ~69% of press capacity below the factory's own average rate. Short-notice jobs cost ≈5% of contribution per constraint-hour, robust to full controls.
4. **Headline 3 — retention (B11, B12):** most reorder timing is near-random (median interval CV ≈ 0.95); forecasting is gated to the ~12 regular accounts. Personalised thresholds flag a different at-risk set (11) than a fixed 90-day rule (8).
5. **The gaps (A2, A3, A6):** no capacity data, no departmental labour split, no cost-to-serve, no scheduling data. Presented as the investment ask.

**Excluded from the presentation** (computed, registered, reason shown in app):
- **B7** (override → +11.2% margin, p=0.049): fails Benjamini-Hochberg at rank 5 of 7 (threshold 0.036) and is selection-biased. Descriptive override facts (B5/B6) are unaffected.
- **A5 gradient** (£3→£170 rush penalty by load): interaction p=0.54; the gradient may not appear on any slide. One spoken sentence: consistent with queueing theory, not established by this data.
- **B10** (concentration): tested, not a risk (Gini ≈0.36, top-1 ≈11%). Register only.
- **Any "value at stake" £ figure.** Without capacity data, displaced work cannot be distinguished from backfilled idle time (contribution absorbs fixed cost when the press would otherwise sit idle), so no counterfactual number is defensible even as an "upper bound". Use only the descriptive form: capacity share at rate X vs benchmark Y.

Banned phrase everywhere: **"sweet spot"**. Vocabulary: contribution per constraint-hour, capacity-constrained resource, crossover threshold (Theory of Constraints / throughput accounting).

---

## 2. Analytical standards

1. **No bare R²** on any model with categorical blocks: report R², adjusted R², parameter count and 5-fold CV R² together (`KFold(shuffle=True, random_state=<config>)`, one-hot with `handle_unknown='ignore'`). Enforced structurally by §5.1 dataclasses.
2. **No bare p-value:** every test reports effect size, 95% CI, p, n (and back-transformed % effect for logged outcomes).
3. **Cluster-robust SEs on customer** for every job-level regression; report cluster count.
4. **In-sample significance ≠ usefulness:** any block with F-test p<0.001 but CV-R² increment <0.02 is flagged `in_sample_only` and reported as such.
5. **Every threshold derived**, with sensitivity across plausible parameters; crossover additionally gets a bootstrap 95% CI (resample jobs, ≥500 draws) and is always reported as a range, not a point.
6. **Mann-Whitney for descriptive group differences; regression with fixed effects for any claim that must survive controls.** Report both when they disagree.
7. **BH correction applied once**, at the end, across the fixed family of headline tests in §5.8. Raw and adjusted p-values both shown. Anything failing correction is barred from headline status automatically.
8. **Partial period:** data ends 2026-05-21; trend/YoY excludes it, everything else flags it, no chart silently includes it.
9. **Negative results are deliverables** — recorded in the register with outcome and reason.

---

## 3. Dataset

`SampleDataSet_<id>.xlsx`, sheet `Master Plain (Anon)`; sheet `Field Definitions` documents columns — read it. 6,355 rows × 36 cols, 50 customers, 9 reps, `SalesIn` 2023-01-03 → 2026-05-21.

### 3.1 Columns
```
Title, CustomerID, Job Status, SalesIn, Year, Month, Week No, SalesOut,
Quantity, Sell Price, Mup%, VA Amount, VA/24, VA%, VA/K, Rebate, Puchases,
Press hrs, Impressions, Handling, Labour, Paper, labmup, manadj, mupnett,
Plates, AmtInv, Customer Name, Rep, Region, Industry, Work Type,
Product Type, Binding Type, Currency, Ship date
```
`Puchases` is misspelled in source — read as-is, rename only in the cleaned frame.

### 3.2 Identities — assert at ingest, raise on failure
- `VA/24 == VA Amount / Press hrs * 24` (holds to 4×10⁻¹⁰)
- `mupnett == labmup + manadj` (holds to 3.6×10⁻¹²) — this is what makes `manadj` interpretable as a £ price override. If a future file breaks it, the pricing module refuses to report rather than emit nonsense.

`VA Amount` is **contribution** (sell price net of purchases), not gross profit — the basis for the §1 exclusion of counterfactual £ figures.

### 3.3 Traps
| # | Trap | Handling |
|---|---|---|
| 1 | Two currencies (3,327 Stg / 3,028 Euro), money fields in home currency | Monthly FX table in config. **Key off `Currency`, never `Region`** (Ireland has 60 Stg jobs, NI has 80 Euro jobs) |
| 2 | Duplicate `Product Type` categories | Config map (§3.4); assert no unmapped value above threshold |
| 3 | Partial 2026 | Derive `is_partial_period`; §2.8 |
| 4 | 225 rows Sell Price ≤ 0 | Quarantine to `credits` frame; report count; never drop silently |
| 5 | Literal `'#DIV/0!'` in `VA%` | `errors='coerce'`, count, report |
| 6 | `Binding Type` null ×2,642 = outsourced binding | Recode to explicit category; never impute |
| 7 | `Press hrs`=0 for all 1,354 Digital + 144 Litho jobs | Constraint analysis Litho-only, stated; denominators use `.replace(0, np.nan)` |
| 8 | 6,226 `z-Closed` + 129 open/held | Closed-only for financials, all rows for cadence; rule documented per module |
| 9 | `SalesOut` null ×129, `Ship date` null ×216 | Null-safe dwell = Ship date − SalesIn; exclude dwell >400d as outliers, report count |

### 3.4 Canonicalisation (config, not code)
```yaml
product_type_map:
  "Brochures / Price LIst": "Brochures / Price List"
  "Leaflets to A4/ Price Lists": "Leaflets / Price Lists"
  "Leaflets to A4 /Price Lists": "Leaflets / Price Lists"
  "Leaflets to A4": "Leaflets / Price Lists"
  "Books/Educational Books": "Educational Books"
  "Certficates": "Certificates"
  "Miscellaneous -ask advice": "Miscellaneous"
  "Miscellaneous-ask advice": "Miscellaneous"
  "Signage (large)": "Signage"
  "Banners Printed": "Banners"
  "Tent Cards/Swatch Cards": "Tent Cards"
  "Menu (Takeaway/throwaway)": "Menu"
  "Menu (Cafe/Restaurant)": "Menu"
  "Diaries / Yearbooks": "Diaries"
  "Postage": "Fulfilment / Postage"
  "Postage/Mailing": "Fulfilment / Postage"
  "Pack and Postage": "Fulfilment / Postage"
  "Pack and Distribution": "Fulfilment / Postage"
  "Fulfilment - other": "Fulfilment / Postage"
long_tail_min_jobs: 15   # charting rollup only; keep canonical value in data
```
Do **not** merge `BPUK Softback Book`/`BPUK Hardback Book` into generic book categories.

**Required:** the decomposition (§5.2) runs on *canonicalised* categories, and only the post-cleaning product figure is reported anywhere. The exploratory pre-cleaning figure (+0.007 CV R²) is provisional and must not be quoted.

---

## 4. Architecture

```
wgb-insights/
├── data/{raw(gitignored), sample}/   # sample/ = synthetic fixture, committed
├── src/
│   ├── ingest.py        # load, Pandera schema, identity assertions, ValidationReport
│   ├── clean.py         # FX, canonicalisation, derived fields, quarantine
│   ├── stats_core.py    # §2 primitives — built and tested FIRST
│   ├── decomposition.py
│   ├── thresholds.py    # crossover, breakpoints, monotonicity, bootstrap CI
│   ├── pricing.py       # override scale + timeboxed override model
│   ├── rush.py
│   ├── churn.py
│   ├── trend.py         # includes concentration stats
│   └── checks.py        # the three named robustness checks + BH pass + register I/O
├── register.yaml        # hypothesis register — data file, rendered by frontend & README
├── tests/
├── api/
│   ├── main.py          # FastAPI app, CORS for localhost:3000
│   ├── schemas.py       # Pydantic models mirroring stats_core dataclasses 1:1
│   └── state.py         # in-memory result cache keyed on uploaded-file hash
├── frontend/            # Next.js (App Router) + Tailwind + react-plotly.js
├── export_assets.py     # §12 presentation asset export
├── verify.py            # §8 make-verify: computed vs §9 expected, pass/deviation table
├── config.yaml          # FX table, maps, thresholds params, seeds, company_turnover_gbp
├── Makefile             # test / verify / api / web / refresh / lint / assets
├── .github/workflows/ci.yml
└── README.md            # run instructions, methodology appendix, register table, gaps
```

**Stack:** Python 3.11+, pandas, openpyxl, pandera, statsmodels, scikit-learn (CV, CART, override model only), scipy, plotly, fastapi, uvicorn, python-multipart, pyyaml, pytest, ruff, mypy. Frontend: Next.js 14+ (App Router), TypeScript, Tailwind, shadcn/ui, react-plotly.js.

**Presentation-layer rules (hard):**
- **No analysis logic in TypeScript, ever.** The frontend renders JSON from the API; Python is the single source of truth. Any number recomputed in JS is a defect.
- Charts are built as Plotly figures in Python and shipped as `fig.to_json()`; the frontend renders them with `react-plotly.js`. No chart logic duplicated.
- Local only — `uvicorn` on :8000, `next dev` on :3000. No deployment, no auth, no database, no state-management library. Fetch, render, done.
- Keep FastAPI's auto-generated `/docs` enabled — it is the fallback demo if the frontend runs long, and a deliverable in its own right.

**Do not add:** database, API layer, frontend framework, scheduler, survival/mixed-effects/quantile/elasticity models (register as future work). n=6,355; depth over surface area.

**Adjudicated cuts from v2** (do not build): a generic `robustness.py` higher-order harness; `register.py` as a module (register is YAML); configurable block-order permutation (run config order + reverse once, appendix); sensitivity grids beyond the three named checks in §5.8.

---

## 5. Module specifications

### 5.1 `stats_core.py` — first, with tests, before anything else

```python
@dataclass(frozen=True)
class ModelReport:
    r2: float; r2_adj: float; r2_cv: float; cv_folds: int
    n_params: int; n_obs: int; n_clusters: int | None; formula: str

@dataclass(frozen=True)
class EffectReport:
    name: str; coef: float; pct_effect: float | None
    ci_low: float; ci_high: float
    p_value: float; p_value_adj: float | None
    n_obs: int; n_clusters: int | None; se_type: str

def fit_reported(formula, data, cluster_on=None, cv_folds=5, seed=None) -> tuple[Any, ModelReport]
def effect(fit, term, logged_outcome=True) -> EffectReport
def cv_r2(data, target, numeric, categorical, folds, seed) -> float
def mannwhitney_reported(a, b, label) -> EffectReport   # median diff + Cliff's delta
def nested_f_test(restricted, full) -> tuple[float, float]
```

All fields required. This is the structural enforcement of §2.1–2.2: no caller can emit a bare number.

### 5.2 `decomposition.py`

```python
def nested_decomposition(data, target, blocks, cluster_on) -> pd.DataFrame
```
Target: `log(contribution per constraint-hour)` clipped at a config floor. Blocks in config order: job size (log, continuous), **run features (`log Quantity`, `log Impressions`, `Plates`)**, product type (canonicalised), customer, rep, year. Per step: R², adj R², CV R², params, adj+CV increments, nested F-test p vs previous. Flag `in_sample_only` per §2.4. Run in config order only; note order-dependence of increments in one README-appendix sentence (reversed run cut for budget).

The run-features block is the adjudicated addition: it tests the run-length-economics mechanism behind the size effect (does size still matter once quantity/impressions/plates are in?) and the answer is reported either way.

### 5.3 `thresholds.py`

```python
def benchmark_rate(data) -> float                      # hour-weighted mean rate
def rolling_rate_curve(data, window, step) -> pd.DataFrame   # pooled rate, size-sorted
def crossover_point(curve, benchmark) -> float         # falls below AND stays below
def crossover_ci(data, n_boot, seed) -> tuple[float, float]  # bootstrap 95% CI
def breakpoints_grid(data, k, min_group) -> list[float]
def breakpoints_cart(data, max_leaves, min_samples_leaf) -> list[float]
def monotonicity_report(data) -> dict   # Spearman rho, curve-max location, interior_optimum: bool
def window_sensitivity(data, windows) -> pd.DataFrame  # crossover across window widths
```
`monotonicity_report` runs **before** any banding and its verdict displays in the app. Exploratory pass: monotonic decline (Spearman ≈ −0.58, max at smallest jobs) → no interior optimum. If new data shows one, the framing changes — the check is live.

Crossover is always reported as: point estimate, window-sensitivity range, bootstrap CI. Never a bare "4.4h".

### 5.4 `pricing.py`

```python
def validate_override_identity(data) -> None           # raise if mupnett ≠ labmup + manadj
def override_flags(data, tolerance) -> pd.DataFrame    # overridden, direction, magnitude
def override_scale(data) -> dict                       # rate, up/down, gross & net £/yr, by segment
def override_effect(data, controls, cluster_on) -> EffectReport   # computed; see status note
def override_model(data, config) -> OverrideModelReport           # TIMEBOXED: 0.25 day
```
`override_effect` (B7) is computed and shown in the app **under an explicit caution banner**: correlational, selection-biased, fails BH correction — and is excluded from headline status and all exported presentation assets. The register records this with the reason.

`override_model`: predict `manadj` (regression on magnitude; classification on direction) from quote-time features: size, `Quantity`, `Impressions`, `Plates`, product, customer, work type, binding, currency, region, prior-job features. **`GroupKFold` grouped on customer** — random KFold leaks account pricing patterns and is a defect. Mandatory baselines: predict-zero, customer-mean, global-mean. Report CV R²/AUC vs every baseline + permutation importance. One model family (gradient boosting or ridge), no tuning beyond defaults, hard cap 0.25 day. **A negative result ships as a finding**: estimators use information the system doesn't capture → data gap.

### 5.5 `rush.py`

```python
def flag_rush(data, percentile, within) -> pd.Series   # bottom-percentile dwell WITHIN size band
def rush_effect(data, controls, cluster_on) -> EffectReport
def load_quantiles(data, n_bins) -> pd.Series          # weekly booked hours; RELATIVE load only
def rush_load_interaction(data, controls, cluster_on) -> dict  # simple slopes + interaction term, separately
def percentile_sensitivity(data, percentiles) -> pd.DataFrame  # e.g. [0.15, 0.20, 0.25, 0.30]
```
Main effect is a headline (exploratory: ≈ −5%, p ≈ 2×10⁻⁵ with controls). The load interaction is computed and displayed with its p-value; the descriptive load gradient appears **only** in the app/appendix, adjacent to the failed interaction test, and never in exported presentation assets. Output text where the interaction fails: consistent with queueing theory (Kingman/VUT), not established by this data.

### 5.6 `churn.py`

```python
def cadence_stats(data, as_of=None) -> pd.DataFrame    # median interval on DISTINCT dates, IQR, CV, gap, gap_ratio
def regularity_gate(cadence, cv_max) -> pd.Series      # forecastable only where CV < cv_max
def risk_table(data, multiplier, cv_max, as_of=None) -> pd.DataFrame
def compare_fixed_rule(data, fixed_days) -> dict       # counts AND set difference
```
`as_of` defaults to `max(SalesIn)`. **Never `datetime.now()`.** The regularity gate is mandatory (exploratory: median CV ≈ 0.95, ~12/50 below 0.75); non-forecastable accounts get a risk band but no predicted next-order date, with the exclusion reason shown. No ML — n=50 customers, transparent rules, decision defended not apologised for.

### 5.7 `trend.py`

Full years only: revenue, VA, VA%, jobs, active customers, rev/job, CAGR; growth attributed volume vs value-per-job. Concentration (Gini, top-1/3/5/10, HHI) computed here, registered as a tested negative, README one-liner, no app tab of its own.

### 5.8 `checks.py`

Three named robustness checks (plain functions, no generic harness):
1. **Currency replication** — size–rate ordering recomputed Stg-only and Euro-only (exploratory: holds in both).
2. **Window sensitivity** — §5.3, surfaced beside the crossover.
3. **Rush percentile sensitivity** — §5.5.

Then the single **BH pass** over the fixed headline family — customer block, run-features block, product block, size, rush main effect, rush×load interaction, override effect — writing `p_value_adj` back into each EffectReport, and the register I/O: read `register.yaml`, attach outcomes and evidence, render for app and README. Any test failing BH is automatically flagged `not_headline` and excluded from asset export.

`register.yaml` minimum entries: margin varies by customer / by product / by rep / by job size / by run features; overrides affect margin; overrides are learnable; rush jobs cost margin; rush cost depends on load; revenue is concentrated; reorder timing is forecastable; growth is volume-driven; an optimal job size exists. Several must come back rejected/underpowered — that is the point.

---

## 6. Data gaps — emitted programmatically as a gap report

| Gap | Blocks | Would enable |
|---|---|---|
| No capacity/utilisation data (press count, machine ID, availability) | Any absolute utilisation claim; any counterfactual £ opportunity figure; knowing when the constraint binds | Conditional acceptance rule for short-notice work; real opportunity costing |
| No departmental labour split (`Labour` is one combined figure) | Measuring idle downstream labour | Line balancing; labour-intensity by job type |
| No cost-to-serve per order (estimating/admin/make-ready not charged per job) | Any "favour small jobs" conclusion — contribution flatters them | True per-order profitability |
| No scheduling-system data | Observing schedule disruption directly (rush flag is a dwell-time proxy) | Measured expediting cost |
| Sample ≈54% of stated turnover (compute from `company_turnover_gbp` in config) | Extrapolation | — |

These map onto the internship's stated workstreams; presented as the investment ask, not apology.

---

## 7. API + frontend

### 7.1 FastAPI endpoints (`api/`)

| Endpoint | Returns |
|---|---|
| `POST /datasets` | Accepts `.xlsx` (multipart), runs ingest→clean→all modules, caches results by file hash, returns `ValidationReport` + gap report. This endpoint IS the "dynamic system" requirement — a new file of the same schema fully refreshes every result with no code change |
| `GET /overview` | Trend series (partial period flagged), scale caveat, headline KPIs |
| `GET /decomposition` | Per-block table: R², adj R², CV R², params, increments, F-test p, `in_sample_only` flags; plus rep naive-vs-controlled pair |
| `GET /pricing` | Override scale (rate, direction, net £/yr, by segment); model performance vs all baselines + permutation importance; override effect wrapped in a `caution` object (correlational, selection-biased, fails BH) |
| `GET /thresholds` | Rate-curve figure JSON, benchmark, crossover point + window range + bootstrap CI, monotonicity verdict, capacity-share-vs-rate statement |
| `GET /rush` | Main effect report; interaction + descriptive gradient in an `inconclusive` object, never top-level |
| `GET /churn` | Cadence table with forecastable gate + exclusion reasons; fixed-vs-personalised comparison with set difference |
| `GET /call-list.csv` | The ranked call-list CSV (columns per below) |
| `GET /register` | Hypothesis register with outcomes, adjusted p-values, robustness status |
| `GET /charts/{name}` | Plotly `fig.to_json()` for each named §12 chart |

Every response body is a Pydantic schema mirroring `ModelReport`/`EffectReport` — all fields required, so no bare number can cross the API boundary. Findings excluded in §1 are structurally marked (`caution` / `inconclusive` / `not_headline`), and the frontend renders those markers visibly.

### 7.2 Next.js pages (`frontend/`)

1. **/** Overview — upload drop-zone (posts to `/datasets`, then refetches everything), validation + gap reports, trend chart, scale caveat.
2. **/margin** Where Margin Lives — decomposition table, `in_sample_only` badges, rep naive-vs-controlled pair.
3. **/pricing** Pricing & Overrides — scale, model-vs-baselines, override effect inside a visibly-styled caution banner.
4. **/constraint** Job Size & the Constraint — rate curve with benchmark + CI band, monotonicity verdict, rush main effect; interaction/gradient in a collapsed section labelled inconclusive.
5. **/retention** Retention Risk — gated cadence table, fixed-vs-personalised set difference, call-list download button.

Register, robustness results and config/seeds render in a collapsible panel on Overview. Static layouts, W&G Baird brand tokens in the Tailwind config, no animation work.

Call-list CSV: `customer, rep, industry, last_order, days_since, own_median_interval, interval_cv, forecastable, gap_ratio, historic_contribution_gbp, contribution_per_constraint_hr, override_rate, risk_band, reason_code, expected_next_order` (last column null where not forecastable).

---

## 8. Engineering requirements

- **`make verify` — the QA gate.** `verify.py` runs the full pipeline on `data/raw/` and prints one table: every §9 expected value, the computed value, the deviation, and PASS / DEVIATION per row, with a non-zero exit code on any deviation beyond tolerance (tolerances per row in `verify.py`, generous for model-derived values, exact for counts and identities). This is how a human confirms in one read that no silent statistical bug exists — plain KFold where GroupKFold was specified, missing clustering, FX by region. **Run it after every build step and before any commit that touches `src/`.** Values marked in §9 as expected-to-shift (post-cleaning, post-run-features) print as INFO with direction, not PASS/FAIL.
- Pandera schema on ingest (dtypes, ranges) + §3.2 identity assertions; fail loudly.
- pytest: FX conversion; canonicalisation completeness; crossover recovery on synthetic data with a known breakpoint; `as_of` behaviour; divide-by-zero paths; both identities; `GroupKFold` grouping actually by customer; one API contract test per endpoint against the synthetic fixture.
- GitHub Actions CI: pytest + ruff + mypy on push; badge in README.
- `Makefile`: `test`, `verify`, `api` (uvicorn :8000), `web` (next dev :3000), `refresh`, `lint`, `assets`.
- Seeds in config, logged in every report; reruns reproducible.
- Structured logging of validation + gap reports to a timestamped file.
- Type hints throughout; docstrings state units and GBP vs home currency.

---

## 9. Regression expectations (approximate; EUR→GBP ≈ 1.17 unless config differs)

| Check | Expected |
|---|---|
| Rows / customers / reps | 6,355 / 50 / 9 |
| SalesIn range | 2023-01-03 → 2026-05-21 |
| Quarantined (Sell Price ≤ 0) | 225 |
| Both identities max error | < 1×10⁻⁸ |
| Decomposition CV R² size / +product / +customer / +rep | ≈ 0.262 / 0.269 / 0.471 / 0.471 (pre-cleaning, pre-run-features baseline; will shift with §5.2 changes — investigate direction, don't force match) |
| Rep block nested F | p ≈ 0.13 (null) |
| Product block | in-sample p ≈ 9×10⁻⁵⁹, CV increment ≈ +0.007 pre-cleaning → `in_sample_only` |
| Spearman size vs rate | ≈ −0.58; interior optimum **False** |
| Benchmark rate / crossover | ≈ £766/hr / ≈ 4.4h (report range + CI) |
| Above-crossover share | ≈ 69% of constraint-hours at ≈ £667/hr |
| Override rate / direction / net | ≈ 61% / 1,551 up vs 1,005 down / ≈ +£98k/yr |
| Override effect | ≈ +11.2%, raw p ≈ 0.049 → **fails BH** → not headline |
| Rush main effect | ≈ −5.0%, p ≈ 2×10⁻⁵ |
| Rush × load interaction | not significant, p ≈ 0.54 |
| Gini / top-1 / top-10 | ≈ 0.36 / 11% / 46% |
| Interval CV median; forecastable count | ≈ 0.95; ~12/50 |
| Fixed vs personalised churn flags | 8 vs 11, different sets |
| Rev CAGR / VA margin change (2023→2025) | ≈ 8.7% / +2.4pts |
| Sample share of turnover | ≈ 54% |

Named examples for slides: `CUST_024` #1 by revenue (~£2.97m, 934 jobs); `CUST_011` ~23% of above-crossover constraint-hours; `CUST_041` ~11% of them at the lowest rate at scale.

---

## 10. Hard constraints

- **`.gitignore` `data/raw/` before the first commit.** Real, commercially sensitive data; repo is public. Ship a synthetic fixture in `data/sample/` so tests and app run without it. Non-negotiable.
- No hardcoded analytical constants in `src/`; thresholds derived, parameters in config.
- No `datetime.now()` in analysis logic.
- FX keys off `Currency`, never `Region`.
- No bare R² or bare p-value on any output surface.
- Nothing tuned to match §9.
- "Sweet spot" appears nowhere.
- Excluded findings (§1) appear in no exported presentation asset.

---

## 11. Build order — single agentic session with verification gates

Build in this sequence. At each **GATE**, stop, run the named command, and show the human the output before continuing.

1. Repo, `.gitignore` **in the first commit**, CI skeleton, `config.yaml`, synthetic fixture in `data/sample/`
2. `stats_core.py` + tests → **GATE: `pytest tests/test_stats_core.py`** green before anything else
3. `verify.py` skeleton with the §9 table (counts rows active, model rows stubbed)
4. `ingest.py` + `clean.py` + FX table → **GATE: `make verify`** — all count/identity rows PASS
5. `decomposition.py` (incl. run-features block, post-cleaning product recheck), `thresholds.py` (monotonicity **before** banding, bootstrap CI)
6. `pricing.py` (scale first, model capped), `rush.py`, `churn.py`, `trend.py`
7. `checks.py` — three named checks, BH pass, register → **GATE: `make verify`** — full table, every §9 row resolved PASS or explained INFO
8. `api/` — endpoints + Pydantic schemas + contract tests
9. `frontend/` — five pages, upload flow, Plotly render; `/docs` is the fallback demo if this step runs long
10. `export_assets.py`, README + methodology appendix + register table → **GATE: `make verify && make test`** clean, then final commit

Human effort model: generation is fast; the gates are where the human catches silently-wrong statistics. Never skip a gate to save time — a wrong number in front of this audience costs more than the whole build.

---

## 12. Presentation asset export (`make assets`)

`export_assets.py` writes to `assets/`, so slide-building requires no code:

1. `trend_context.png` — revenue + VA margin by full year, partial 2026 greyed with label
2. `decomposition_table.png` + `.csv` — the four-R²-column table, `in_sample_only` rows marked
3. `rep_confounding.png` — naive vs controlled pair, one line of conclusion text on-image
4. `override_scale.png` — override rate, direction split, net £/yr
5. `rate_curve.png` — the §5.3 curve: benchmark line, crossover + CI band, monotonic decline visible
6. `capacity_share.png` — share of constraint-hours above crossover vs rate, descriptive form only
7. `rush_effect.png` — main effect with CI (no load gradient)
8. `churn_comparison.png` — fixed vs personalised flags with set difference
9. `call_list_sample.csv` — top 10 rows
10. `findings_summary.md` — every headline with its effect size, CI, adjusted p, n, robustness status; every exclusion with its one-line reason; the gap report; the §9 named examples — the script source for the video

(Interactive HTML chart exports cut: the Next.js frontend is the live demo, screen-recorded directly.)

All charts at 1920×1080, W&G Baird brand styling (apply the brand skill/guidelines; match the Streamlit theme in `.streamlit/config.toml` so the live demo and the slides look like one product).

---

## 13. Suggested video structure (4–6 min ≈ 800 words; not code — for the human)

- 0:00–0:40 Problem + context: growth is price not volume; press hours are the constrained asset; no systematic view of margin or retention (DSRM: problem, objectives)
- 0:40–1:10 Design: pipeline, standards (derived thresholds, out-of-sample validation, cluster-robust errors), why transparent rules beat ML at n=50 (design)
- 1:10–2:00 Live demo in the web app: drop a second file into the uploader, watch every page refresh; one glance at `/docs` to show the typed API (demonstration)
- 2:00–3:00 Headline 1: margin lives with the account; the 61% / £98k override finding; the rep dashboard the data invites you to build and why it wasn't built (20s)
- 3:00–3:50 Headline 2: no optimal job size — continuous decline, crossover with CI, 69% of capacity below the factory's own average; rush jobs −5%; one sentence on the unproven load interaction
- 3:50–4:30 Headline 3: retention gated on forecastability; personalised vs fixed; the call list
- 4:30–5:10 Evaluation + limitations: 54% sample, contribution ≠ profit, correlational boundaries, what failed BH and why that's reported (evaluation)
- 5:10–5:45 Recommendations: capture capacity + departmental hours + cost-to-serve; £/constraint-hour floors at quote stage; automate the MIS feed (communication)

Practise timed. Over 6:00 fails a stated maximum.
