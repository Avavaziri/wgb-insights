# Findings summary: SampleDataSet.xlsx (as_of 2026-05-21)

Sample ~52% of stated turnover; nothing here extrapolates. All money GBP after FX keyed on Currency. Constraint analysis is Litho-only (no press hours elsewhere). Seeds {'global': 42, 'cv': 42, 'bootstrap': 42}. Every number reproduces.

## Context
- Revenue CAGR 8.5% (2023->2025) with flat jobs (+2.3%) and customers 48 -> 48: growth is value per job (+6.0%), margin +2.0pts.

## Headline 1: pricing governance
- Margin is an account property: customer identity adds +0.20 cross-validated R2; product adds nothing out-of-sample (in-sample only); rep adds nothing (the rep league table would mislead: customer mix).
- 61% of constraint-frame jobs are manually re-priced: 1,525 up vs 977 down, net +97k GBP/yr of untracked human judgement.
- The override is NOT learnable at quote time (GroupKFold R2 -0.07 vs best baseline; direction AUC 0.57): estimators use information the system doesn't capture, which is a data gap, and the case for capturing override reasons in the MIS.

## Headline 2: the constraint
- Contribution per constraint-hour declines monotonically with size (Spearman -0.58; no interior optimum, no 'optimal job size' exists).
- Crossover threshold 4.3h (window range 4.1-4.3h, bootstrap 95% CI 4.2-4.6h): work above it occupies 65% of press capacity at 664 GBP/hr vs the factory's own average 769 GBP/hr. Descriptive only: no counterfactual GBP figure is defensible without capacity data.

## Headline 3: retention
- Most reorder timing is near-random (median interval CV 0.97); next-order prediction is gated to 14/50 regular accounts. The system refuses to invent dates for the rest.
- Personalised thresholds (own median x (1 + 1.5 x own CV)) flag 13 accounts vs the fixed 90-day rule's 8: different accounts, not just different counts. Ranked call list exported.

## Computed but excluded (with reasons; the register is the audit trail)
- Rush penalty -4.6% (raw p 0.044): fails the family-wise BH correction (adj p 0.052) under the mandated cluster-robust SEs. Reported as suggestive; excluded from headlines and this export by the system's own rule. One spoken sentence.
  Say it as pricing, never as selection: most of the cost base is fixed, so an hour at a lower contribution rate still beats an idle hour. Declining short-notice work would only pay if the constraint were binding and the rush job displaced a better-rate one, and there is no capacity data here to establish when that happens.
- Override -> margin (+11.2%, adj p 0.032): survives BH but remains excluded as selection-biased (humans choose which jobs to reprice); shown in-app under a caution banner only.
- Rush x load gradient: interaction p 0.34, consistent with queueing theory, not established by this data. Appendix only.
- Concentration: tested negative (Gini 0.37, top-1 11%, top-10 46%): register line.

## Data gaps (the investment ask)
- **No capacity/utilisation data (press count, machine ID, availability)**. Blocks: Any absolute utilisation claim; any counterfactual GBP opportunity figure; knowing when the constraint binds
- **No departmental labour split (Labour is one combined figure)**. Blocks: Measuring idle downstream labour; any labour-intensity ratio is a proxy, labelled as such
- **No cost-to-serve per order (estimating/admin/make-ready not charged per job)**. Blocks: Any 'favour small jobs' conclusion; contribution flatters them
- **No scheduling-system data**. Blocks: Observing schedule disruption directly (rush flag is a dwell-time proxy)
- **Sample is ~52% of stated turnover**. Blocks: Extrapolation to company totals

## Named examples
- CID_001: #1 by revenue (GBP 2.94m, 863 jobs)
- CID_002: 17% of above-crossover constraint-hours
- CID_036: 3% of above-crossover hours at the lowest rate at scale (GBP 414/hr)

## BH family (raw -> adjusted p)
- customer_block: 3.1e-270 -> 2.2e-269 (passes)
- size_effect: 4.1e-265 -> 1.4e-264 (passes)
- product_block: 3.4e-42 -> 7.9e-42 (passes)
- run_features_block: 9.5e-21 -> 1.7e-20 (passes)
- override_effect: 0.023 -> 0.032 (passes)
- rush_main_effect: 0.044 -> 0.052 (FAILS)
- rush_load_interaction: 0.34 -> 0.34 (FAILS)
