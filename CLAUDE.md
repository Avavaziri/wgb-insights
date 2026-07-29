# CLAUDE.md — wgb-insights

Read `PROJECT_SCOPE.md` in full before writing or changing code. It is final and adjudicated: §2 (standards) and §5 (module specs) are the contract, §1 fixes which findings are headlines and which are computed-but-excluded, §11 timeboxes are hard, §9 values are **regression tests, not inputs** — never hardcode or tune toward them; flag material disagreements instead.

## What this is

A dynamic analytics system over W&G Baird print-job sales data, built for a recruitment task. Judged on analytical judgement and a 4–6 minute board presentation. Audience includes developers, data scientists and academics — they probe methodology. Margin metric: **contribution per constraint-hour** (Theory of Constraints); press hours are the capacity-constrained resource.

## Standards — violations are defects

- No bare R² (report R² / adj R² / CV R² / params together — enforced by stats_core dataclasses with all fields required)
- No bare p-value (effect size, 95% CI, p, n)
- Cluster-robust SEs on customer for every job-level regression
- Every threshold derived, reported as range + bootstrap CI, never a bare point
- BH correction applied once over the fixed headline family in checks.py; anything failing is auto-excluded from headline status and asset export
- Negative results recorded in register.yaml with reasons
- Build stats_core.py first; nothing else until its tests are green

## Adjudicated exclusions — computed, never presented

- Override→margin effect (p≈0.049): fails BH, selection-biased. App shows it under a caution banner only.
- Rush×load gradient (£3→£170): interaction p≈0.54. Appendix/expander only, always adjacent to the failed test.
- Any counterfactual "value at stake" £ figure: contribution absorbs fixed cost when the constraint idles, and capacity data doesn't exist — use the descriptive form only (capacity share at rate X vs benchmark Y).
- Concentration: tested negative, register + README line only.
- The phrase **"sweet spot"** — banned everywhere. No interior optimum exists (monotonic decline); use "crossover threshold".

## Non-negotiables

- `.gitignore data/raw/` in the FIRST commit — real commercially sensitive data, public repo. Synthetic fixture in data/sample/ keeps tests and app runnable.
- FX keys off `Currency`, never `Region` (Ireland has Stg jobs, NI has Euro jobs).
- No `datetime.now()` in analysis logic — as_of derives from max(SalesIn).
- `Puchases` is misspelled in source: read as-is, rename only in the cleaned frame.
- Assert both identities at ingest: `VA/24 == VA Amount/Press hrs*24` and `mupnett == labmup + manadj`. If the second breaks on new data, the pricing module refuses to report.
- Data ends 2026-05-21: trend excludes the partial period, everything else flags it.
- `Press hrs`=0 for all Digital jobs → constraint analysis is Litho-only, stated in output.
- `Binding Type` null = outsourced binding. Data, not absence.
- Override model uses **GroupKFold grouped on customer** — plain KFold leaks account pricing patterns and is a defect. Mandatory baselines: zero, customer-mean, global-mean. Hard cap 0.5 day; a negative result ships as a finding.
- Stack: FastAPI backend (typed Pydantic schemas mirroring stats_core dataclasses; /docs enabled) + Next.js frontend (Tailwind, react-plotly.js). **No analysis logic in TypeScript, ever** — the frontend renders JSON, Python is the single source of truth; a number recomputed in JS is a defect. Charts ship as Plotly fig.to_json() from Python. Local only: no deployment, no auth, no database, no state library.
- No scheduler, no extra model families. n=6,355. Depth, not surface area.
- **`make verify` is the QA gate**: full pipeline, every §9 expected value vs computed, PASS/DEVIATION per row, non-zero exit on deviation. Run at every §11 GATE and before any commit touching src/. Never skip a gate.

## Known limitations to keep visible in output

- `Labour` combines prepress/press/finishing — any labour-intensity ratio is a proxy, labelled as such everywhere; never "measured idle time".
- No capacity data — load bins are relative, never utilisation percentages.
- No cost-to-serve — contribution flatters small jobs; blocks "favour small jobs" conclusions.
- Sample ≈54% of stated turnover — no extrapolation; compute from config, don't hardcode.

## Style

Concise, typed signatures. Docstrings state units and GBP vs home currency. Every derived metric carries one line on what it proxies and what it does not. Flag risks directly; if the scope looks wrong somewhere, say so once before implementing.
