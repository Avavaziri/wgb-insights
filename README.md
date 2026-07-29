# wgb-insights

Dynamic analytics over W&G Baird print-job sales data. Upload a new
`.xlsx` of the same schema and every result — statistics, charts, call
list, hypothesis register — recomputes with no code change.

**Margin metric:** contribution per constraint-hour (Theory of
Constraints; press hours are the capacity-constrained resource).
**Architecture:** Python owns every number (pandas + statsmodels +
scikit-learn), FastAPI serves typed results, Next.js renders them.
No analysis logic exists in TypeScript; charts ship as Plotly
`fig.to_json()` from Python. Local only — no deployment, no auth, no
database.

```
xlsx ──▶ ingest (schema + identity checks) ──▶ clean (FX, quarantine, canonicalise)
     ──▶ analysis modules (decomposition, thresholds, pricing, rush, churn, trend)
     ──▶ checks (3 robustness checks + ONE Benjamini-Hochberg pass + register)
     ──▶ FastAPI (typed schemas) ──▶ Next.js (renders JSON)  +  asset export (PNG/CSV/MD)
```

## Setup (Windows, tested; any OS with Python 3.12 + Node works)

```bash
# Python side — conda or venv, Python 3.12
conda create -n wgb-insights python=3.12
conda activate wgb-insights
pip install -r requirements.txt
conda install -c conda-forge make   # Windows only: provides `make`

# Frontend
cd frontend && pnpm install && cd ..
```

Put the real export in `data/raw/` (any `*.xlsx`; the folder is
gitignored — **the real data must never be committed, the repo is
public**). Without it, everything runs against the committed synthetic
fixture `data/sample/sample.xlsx` (same schema, every data trap planted).

## Run

```bash
make api      # FastAPI on :8000 — /docs is a deliverable, keep it open
make web      # Next.js on :3000 (needs the API)
make verify   # THE QA GATE — see below
make test     # pytest (92 tests, fixture only, no real data needed)
make lint     # ruff + mypy
make assets   # writes assets/ — every §12 presentation artefact
make fixture  # regenerate the synthetic fixture
```

First API request runs the full pipeline (~1–2 min); results are cached
by file hash. The Overview page has the upload drop-zone — the
dynamic-system demo.

## `make verify` — the QA gate

Runs the full pipeline on `data/raw/` and prints one table: every
expected value from the scope's regression-test list vs the computed
value, PASS / DEVIATION / INFO per row, non-zero exit on any deviation.
Tolerances are exact for counts and identities, generous for
model-derived values. This is how a human confirms in one read that no
silent statistical bug exists (plain KFold where GroupKFold was
specified, missing clustering, FX keyed off the wrong column).

Current state: **24/24 checks green** against the real export.

## Methodology (what the numbers mean and don't)

- **Reporting standards, enforced structurally.** Results travel as
  frozen dataclasses (`ModelReport`, `EffectReport`) with all fields
  required, mirrored 1:1 by Pydantic schemas: no bare R² (R²/adj/CV/params
  travel together), no bare p-value (effect size, 95% CI, p, n), and the
  server refuses to serialise anything less.
- **Cluster-robust SEs on customer for every job-level regression**
  (50 clusters). Note: the exploratory rush p ≈ 2×10⁻⁵ reproduces only
  with nonrobust SEs; the honest clustered value is p = 0.044.
- **One BH pass** over a fixed 7-test family (`config.yaml:bh_family`),
  applied once in `checks.py`. Anything failing is automatically
  `not_headline` and excluded from asset export — this demoted the rush
  finding (adj p = 0.052), and the export includes `bh_family.png`
  showing exactly that. The override→margin effect survives BH
  (adj p = 0.032) but stays excluded anyway: it is selection-biased —
  the bias, not the p-value, is the problem.
- **Every threshold is derived and travels with its uncertainty.**
  Crossover: point + window-sensitivity range + bootstrap CI (500
  seeded draws). Override tolerance (£1) sits in the observed bimodal
  gap of |manadj| (rounding noise ≤ ~£0.60 vs human adjustments ≥ ~£9),
  with rate sensitivity reported across £0.5/1/2/5.
- **FX keys off `Currency`, never `Region`** (Ireland has Stg jobs, NI
  has Euro jobs). Monthly rates in `config.yaml` (default 1.17 EUR/GBP);
  the size–rate ordering replicates within each currency separately.
- **`as_of` derives from max(SalesIn)** — never the clock; identical
  file, identical results, forever. All seeds in config and logged.
- **Churn:** cadence on distinct order dates; next-order prediction
  gated to accounts with interval CV < 0.75 and ≥ 4 orders (14/50) — no
  invented dates for the rest. Personalised at-risk threshold:
  gap > own median × (1 + 1.5 × own CV). n=50 → transparent rules, no ML.
- **Override learnability:** ridge + GroupKFold grouped on customer
  (plain KFold would leak account pricing patterns) vs three mandatory
  baselines. Result: not learnable (R² −0.07 vs baselines ≈ −0.01;
  direction AUC 0.57) — the estimators use information the MIS doesn't
  capture. Shipped as a finding, not a failure.

### Known limitations (kept visible in every output surface)

- `Labour` combines prepress/press/finishing — labour-intensity ratios
  are proxies, labelled as such; never "measured idle time".
- No capacity data — load bins are relative; **no utilisation
  percentages and no counterfactual "£ at stake" figures anywhere**
  (contribution absorbs fixed cost when the constraint idles).
- No cost-to-serve — contribution flatters small jobs; blocks any
  "favour small jobs" conclusion.
- Sample ≈ 52% of stated turnover — nothing extrapolates.
- Undocumented data facts found and handled: `manadj`/`mupnett` null ×64
  (excluded from override analysis, counted), `Puchases` null ×12,
  `Product Type` null ×1, `Work Type` has 4 values (Outwork and Wide
  Format carry no press hours), 2 Digital jobs with press hours, and
  the `#DIV/0!` cells are native Excel error cells counted via openpyxl
  before pandas silently turns them into NaN.

## Hypothesis register

`register.yaml` records every hypothesis; `checks.py` attaches outcomes
at runtime (rendered live at `/register` and on the Overview page).
Negative results are deliverables: rep effect (null), product type
(in-sample only), concentration (not a risk), optimal job size (does
not exist), override learnability (no), rush×load interaction
(unproven), rush main effect (demoted by BH).

## Repository layout

```
data/{raw (gitignored), sample}/   src/          analysis modules + pipeline
api/                               frontend/     FastAPI · Next.js
tests/ (92)                        assets/       exported presentation artefacts
verify.py · export_assets.py · register.yaml · config.yaml · Makefile
```

## CI

GitHub Actions on every push: ruff, mypy, pytest (fixture only — real
data never reaches CI) and a secrets guard that fails the build if
anything under `data/raw/` or an env file is ever tracked. Skipped
stages, deliberately: no artifact registry, no staging/production
promotion, no monitoring — the system is local-only by design (the
scope forbids deployment); the pipeline ends at tested, linted source.
