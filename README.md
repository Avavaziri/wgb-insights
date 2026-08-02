# wgb-insights

Dynamic analytics over W&G Baird print-job sales data. Upload a new
`.xlsx` of the same schema and every result (statistics, charts, call
list, hypothesis register) recomputes.

## Executive summary

**The problem.** The business sees margin per invoice, never per hour of
press time, the one resource a factory cannot stretch. Churn is watched
by gut feel; the pricing judgement of the estimators is recorded nowhere.

**The findings.** 65% of litho press hours are sold below the factory's
own average rate, concentrated in jobs over ~4.3 press-hours, and the
gradient survives with the customer held fixed — it is pricing, not
account mix. 61% of litho jobs are re-priced by hand (net ~£97k/yr) and
a fairly-tested model cannot reproduce those overrides for an unseen
account: the knowledge is tacit and at risk. Thirteen accounts are
silent beyond their own ordering rhythm; a backtested per-account rule
catches all of the accounts that truly went quiet where a flat 90-day
rule misses one.

**The actions.** Review quotes past the crossover against the factory's
own rate; log the reason behind each manual override; ring the thirteen,
most valuable first. **The ask:** a sequenced two-year programme —
year 1 measurement (capacity instrumentation, cost-to-serve sampling;
mostly process and staff time), year 2 pricing-knowledge capture; each phase gating the next.

**Objectives it was built to, each with its test:** (1) refreshes from a
new extract with no code change — enforced by the upload path and its
tests; (2) no headline ships unless it survives a fixed multiple-testing
checkpoint — enforced in `checks.py`, which demoted one of this
project's own findings; (3) every number on screen is computed in
Python, never in the browser — enforced by the typed API boundary.

**Margin metric:** contribution per constraint-hour (Theory of
Constraints; press hours are the capacity-constrained resource).
**Architecture:** Python owns every number (pandas + statsmodels +
scikit-learn), FastAPI serves typed results, Next.js renders them.
No analysis logic exists in TypeScript; charts ship as Plotly
`fig.to_json()` from Python. Local only: no deployment, no auth, no
database.

### Why this stack, and what was rejected

The brief asks for a *system* that updates itself, read by a
non-technical board and auditable by a research audience. That ruled
out, in order: **Excel** (not re-runnable, no clustered inference,
formulas are the analysis and the presentation at once); **an
off-the-shelf BI tool** (Power BI/Tableau render aggregates well but
GroupKFold, cluster bootstraps and BH corrections do not live inside
them, so the statistics would sit in an unaudited sidecar); **a
notebook** (runs once, for the author); **Streamlit** (the original
scope sketch — fine for a demo, but it offers no typed contract between
the numbers and their display, and the one non-negotiable here is that
no figure can be silently recomputed in the view layer). The shipped
split — Python behind a documented, schema-validated API, a frontend
that only renders JSON — is the smallest architecture in which the
pipeline that feeds the browser is byte-identical to the one that feeds
the exported slides and any future MIS intake.

```
xlsx ──▶ ingest (schema + identity checks) ──▶ clean (FX, quarantine, canonicalise)
     ──▶ analysis modules (decomposition, thresholds, pricing, rush, churn, trend)
     ──▶ checks (3 robustness checks + ONE Benjamini-Hochberg pass + register)
     ──▶ FastAPI (typed schemas) ──▶ Next.js (renders JSON)  +  asset export (PNG/CSV/MD)
```

## Setup (Windows, tested; any OS with Python 3.12 + Node works)

```bash
# Python side: conda or venv, Python 3.12
conda create -n wgb-insights python=3.12
conda activate wgb-insights
pip install -r requirements.txt
conda install -c conda-forge make   # Windows only: provides `make`

# Frontend
cd frontend && pnpm install && cd ..
```

Put the real export in `data/raw/` (any `*.xlsx`). The folder is
gitignored, because **the real data must never be committed and the repo
is public**. Without it, everything runs against the committed synthetic
fixture `data/sample/sample.xlsx`, which has the same schema and every
data trap planted.

## Run

```bash
make api      # FastAPI on :8000; /docs is a deliverable, keep it open
make web      # Next.js on :3000 (needs the API)
make verify   # THE QA GATE, see below
make test     # pytest (107 tests, fixture only, no real data needed)
make lint     # ruff + mypy
make assets   # writes assets/: every §12 presentation artefact
make fixture  # regenerate the synthetic fixture
```

First API request runs the full pipeline (~1–2 min); results are cached
by file hash. The Overview page has the upload control, which is the
dynamic-system demo.

## The app: three tabs

- **Overview**: upload, a plain-language findings summary, the
  validation and gap reports, the trend chart, and an "Evidence &
  method" section holding every proof one click deep (the hypothesis
  register, the nested decomposition, the BH pass, the two held-back
  results, the override-learnability negative result, rush sensitivity,
  seeds and the `/docs` link).
- **Dashboards**: every chart panel on one page, led by the constraint
  gauge. A year slicer refetches the descriptive panels with
  `?year=YYYY`, recomputed in Python; model-backed panels always use the
  full sample and wear a "full period" chip while a year is active,
  because a per-year effect estimate would be a new analysis rather than
  a filter. Panel toggles filter the view; Plotly legends toggle series.
- **Customers & actions**: most valuable customers and types of work
  (descriptive rankings with their caveats), and the ranked retention
  call list with each account's historic contribution, plus the CSV.

Chart titles state the finding; a smaller neutral line under each names
the measurement. Styling follows the house dashboard register: white
ground, bold sans, yellow as a thin accent (section rails, KPI card top
borders, the uniform outline on chart marks) while category identity
inside figures lives entirely in the charcoal/grey fills, so the accent
encodes nothing. Figures are built once in Python, so the web view and
the exported slides are the same artwork.

Note: `uvicorn --reload` has proved unreliable on Windows here, dropping
its file watcher after the first change. If a Python edit does not show
up, restart the API.

## `make verify`, the QA gate

Runs the full pipeline on `data/raw/` and prints one table: every
expected value from the scope's regression-test list against the
computed value, PASS / DEVIATION / INFO per row, non-zero exit on any
deviation. Tolerances are exact for counts and identities, generous for
model-derived values. This is how a human confirms in one read that no
silent statistical bug exists (plain KFold where GroupKFold was
specified, missing clustering, FX keyed off the wrong column).

Current state: **24/24 checks green** against the real export.

## Method framing: DSRM, threats to validity, and where this goes

The build follows the six Design Science Research Methodology activities
(Peffers et al.), and each maps to something concrete in this repo:

1. **Problem identification** — margin is opaque at the point it is made:
   per press-hour on the capacity constraint, not per invoice.
2. **Objectives** — a dynamic system a non-technical board can read and a
   new extract can update, with statistical discipline a research
   audience can audit.
3. **Design & development** — the pipeline, hypothesis register, typed
   API and app in this repo; the artifact type is an instantiation.
4. **Demonstration** — it runs on the real company extract; every upload
   is a fresh demonstration.
5. **Evaluation** — ex-post and **technical/artificial** (in FEDS
   terms): 24 regression checks against pre-agreed values
   (`make verify`), the test suite, one BH pass that demoted the
   author's own finding, a held-out-year backtest for the churn rules,
   and negative results recorded with reasons in the register. What has
   NOT happened is naturalistic evaluation — no estimator, salesperson
   or director has used the artifact on a real task yet; that is
   deliberately the year-1 activity of the programme below, not a claim
   made in advance.
6. **Communication** — the board video, this README, and `/docs`.

**Implementation risks** (distinct from the statistical threats below):
schema drift — a future MIS export that renames a column is rejected at
upload with the reason, but someone must own updating the mapping;
rule ossification — the 4.3h crossover is a *review trigger* and will
harden into a pricing rule if left unattended, so it should be
re-derived on each new extract (it is, automatically) and re-read by a
person quarterly; adoption — a call list nobody rings is a report, not
a system; key-person dependency — the build is currently understood by
one person, which the README's style is meant to mitigate;
local-only scope — no auth and no deployment hardening, so putting this
on a network as-is would be a defect, not a feature; authentication is a
prerequisite to hosting it anywhere, on-premises or cloud.

**Threats to validity, and where each is handled:** selection (the
override→margin effect is computed and excluded — overridden jobs are
chosen by humans); confounding (the rep effect vanishes under controls;
the size gradient ships with its within-customer check); multiple testing
(one pre-registered BH family); sampling (~52% of turnover, nothing
extrapolates); measurement (`Labour` is a proxy and labelled as such);
temporal (the partial year is flagged everywhere and never annualised).
There are no protected personal attributes in this data, so fairness
reduces to the above plus not letting outputs be used unfairly against
staff — which is what the rep analysis is for.

**Where this goes** (the two-year arc, also on the Overview): year 1 —
instrument press capacity (a downtime taxonomy agreed with operators and
new MIS fields, before any sensor spend), then a cost-to-serve study (a
time-and-motion sample, not a new system); year 2 — capture the
estimators' tacit pricing knowledge (one new field on the quote screen
from day one, then structured elicitation, evaluated against this
build's baselines and the temporal split named above), and feed the
intake from the MIS so the dashboards run live. Run as supervised
research from operations/management science, with the temporal-split
evaluation of estimator knowledge capture as the partnership's first
joint output.

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
  `not_headline` and excluded from asset export. That demoted the rush
  finding (adj p = 0.052), and the export includes `bh_family.png`
  showing exactly that. The override→margin effect survives BH
  (adj p = 0.032) but stays excluded anyway because it is
  selection-biased, and the bias rather than the p-value is the problem.
  Two disclosures an academic reader should have without digging: the
  four block F-tests in the family are refit nonrobust, because a
  49-dummy customer block cannot be Wald-tested cluster-robustly on 50
  clusters — the customer block's real evidence is its out-of-sample CV
  gain, not its p-value; and on the restricted three-test family of the
  genuinely-in-doubt effects (rush, rush×load, override), the override
  effect (raw p = 0.023) fails BH as well — consistent with, not in
  tension with, its exclusion.
- **Every threshold is derived and travels with its uncertainty.**
  Crossover: point + window-sensitivity range + a CLUSTER bootstrap CI
  (500 seeded draws resampling customers, not jobs — an account's jobs
  share negotiated prices, so an i.i.d. job bootstrap understates the
  interval, for the same reason every regression clusters on customer).
  Override tolerance (£1) sits in the observed bimodal
  gap of |manadj| (rounding noise ≤ ~£0.60 vs human adjustments ≥ ~£9),
  with rate sensitivity reported across £0.5/1/2/5.
- **The size gradient is checked for customer composition.** The pooled
  rate curve confounds within-account pricing with which accounts place
  big jobs, so the within-customer size effect (log rate on log size
  with customer and year fixed effects, cluster-robust) ships alongside
  the curve: in this extract roughly two-thirds of the pooled decline
  survives with the account held fixed. The annotation on the curve
  reports whatever the current file computes.
- **FX keys off `Currency`, never `Region`** (Ireland has Stg jobs, NI
  has Euro jobs). Monthly rates in `config.yaml` (default 1.17 EUR/GBP);
  the size–rate ordering replicates within each currency separately.
- **`as_of` derives from max(SalesIn)**, never the clock. Identical
  file, identical results, forever. All seeds in config and logged.
- **Churn:** cadence on distinct order dates; next-order prediction
  gated to accounts with interval CV < 0.75 and ≥ 4 orders (14/50), with
  no invented dates for the rest. Personalised at-risk threshold:
  gap > own median × (1 + 1.5 × own CV). n=50 means transparent rules,
  no ML. The rule is BACKTESTED, not just asserted: with the final year
  held out and flags raised from history alone, the personalised rule
  caught all 3 accounts that then went fully quiet (flagging 9); the
  fixed 90-day rule caught 2 of 3 (flagging 6). "Went quiet for a year"
  is a proxy for churn and the outcome count is small, so the result
  always ships with its raw counts, never as bare rates.
  **The ×1.5 multiplier is derived, not picked** — the same standard
  every other threshold here gets: `churn.multiplier_sensitivity` sweeps
  ×1.0/×1.25/×1.5/×2.0 through the identical backtest, and 1.5 is the
  strictest setting that still catches all 3 quiet accounts (×2.0 drops
  to 2 of 3; looser settings flag 11–12 accounts to catch the same 3).
  The sweep rides inside `churn_backtest` so it recomputes with every
  upload. The CV gate (0.75) and minimum order count (4) remain
  judgement calls at n=50 — stated as such rather than dressed up.
- **Override learnability:** ridge + GroupKFold grouped on customer
  (plain KFold would leak account pricing patterns) vs the mandatory
  baselines. Result: not learnable for an unseen account (R² −0.07 vs
  baselines ≈ −0.01/−0.02; direction AUC 0.57). Scope stated honestly:
  under GroupKFold the customer-mean baseline necessarily degenerates to
  the global mean (test customers never appear in training), so the
  design rules out cold-start prediction; the deployment question —
  the next quote for an existing customer — needs a forward-chaining
  temporal split, which is named as follow-on work rather than claimed.
  **Why one linear model with defaults is the deliberate capacity:**
  ~3,900 overridden jobs across 50 accounts under grouped CV leaves a
  tuned nonlinear search with enough researcher degrees of freedom that
  a positive result would be uninterpretable; the effort cap was fixed
  in scope before results, and the baselines — not the model family —
  carry the conclusion. The model is behind predict-zero, not narrowly
  behind a tuned rival; a family upgrade does not rescue that, and if it
  ever could, the temporal split above is where it must prove it.
- **The nested decomposition is order-dependent by construction.**
  Blocks enter in the fixed config order, so each CV increment reads as
  "value added on top of everything before it", never as a variance
  share. A reversed-order pass was scoped out (an adjudicated cut, noted
  in `src/decomposition.py`). The two claims the app makes from the
  table are made from the conservative positions anyway: customer enters
  after size, run features and product, so its dominant increment is
  what survives once those have taken their share; and for rep — where
  entering last WOULD invite "of course it's zero, everything else
  absorbed it" — the app ships the naive rep-alone model beside the
  controlled one, so both ends of the ordering question are visible and
  the claim does not rest on the sequence.
- **The rush penalty is a pricing argument, not a selection one.** Most
  of the cost base is fixed, so an hour at a lower contribution rate
  still beats an idle hour. Declining short-notice work would only pay
  if the constraint were binding and the rush job displaced a
  better-rate one, and there is no capacity data here to establish when
  that happens.

### Known limitations (kept visible in every output surface)

- **Constraint analysis is litho-only, and that scope has a size:** the
  ~2,100 jobs (about a third of the count) carrying zero press hours —
  digital, outwork, wide format — do not compete for the presses, so
  their margin is an unconstrained question this system deliberately
  does not answer. The capacity headline is a claim about litho hours,
  never about the whole book of work.
- **Two analyses are scoped out by name, in the register, with reasons:**
  next-order *value* forecasting (irregular rhythms and 50 accounts
  leave no train/test headroom; the call list predicts timing and
  reports historic worth, labelled as such) and seasonality (too few
  whole years to separate cycle from trend honestly; regular annual
  orderers are absorbed by the cadence rule). Both are follow-on work,
  not oversights — an unnamed omission reads as a gap, a named one is a
  decision.
- No customer segmentation/RFM model, deliberately: at 50 accounts the
  segments would be the accounts, and transparent rankings a sales team
  can argue with beat opaque clusters. No revenue forecasting: three
  full annual observations cannot support one.
- `Labour` combines prepress/press/finishing, so any labour-intensity
  ratio is a proxy, labelled as such; never "measured idle time".
- No capacity data, so load bins are relative. **No utilisation
  percentages and no counterfactual "£ at stake" figures anywhere**
  (contribution absorbs fixed cost when the constraint idles).
- No cost-to-serve, so contribution flatters small jobs. That blocks any
  "favour small jobs" conclusion.
- Sample ≈ 52% of stated turnover, so nothing extrapolates.
- Undocumented data facts found and handled: `manadj`/`mupnett` null ×64
  (excluded from override analysis, counted), `Puchases` null ×12,
  `Product Type` null ×1, `Work Type` has 4 values (Outwork and Wide
  Format carry no press hours), 2 Digital jobs with press hours, and
  the `#DIV/0!` cells are native Excel error cells counted via openpyxl
  before pandas silently turns them into NaN.

## Hypothesis register

`register.yaml` records every hypothesis; `checks.py` attaches outcomes
at runtime, rendered live in the Overview's Evidence & method section.
Negative results are deliverables: rep effect (null), product type (in-sample only),
concentration (not a risk), optimal job size (does not exist), override
learnability (no), rush×load interaction (unproven), rush main effect
(demoted by BH).

## Repository layout

```
data/{raw (gitignored), sample}/   src/          analysis modules + pipeline
api/                               frontend/     FastAPI · Next.js
tests/ (107)                       assets/       exported presentation artefacts
verify.py · export_assets.py · register.yaml · config.yaml · Makefile
```

## CI

GitHub Actions on every push and pull request, in three jobs:

1. **Secrets guard**, which runs alone and first. It fails the build if
   anything under `data/raw/`, an env file or a key is tracked, and it
   checks the whole history rather than just the working tree. On a
   public repo holding analysis of real commercial data, nothing else
   about the build matters if the extract leaks.
2. **Python:** ruff, mypy, pytest (fixture only, so the real data never
   reaches CI).
3. **Frontend:** eslint, `tsc --noEmit`, `next build`. pnpm comes from
   corepack rather than a third-party action.

`main` carries a ruleset requiring a pull request and all three checks,
so a failing check actually blocks. Dependabot is on for pip, npm and
actions, grouped weekly.

`make verify` is deliberately a local gate, not a job: it needs
`data/raw/` to compare against the expected values, and that never
reaches CI.

Skipped stages, deliberately: no artifact registry, no staging or
production promotion, no monitoring. The system is local-only by design
because the scope forbids deployment, so the pipeline ends at tested,
linted source.
