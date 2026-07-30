"""The §6 data-gap report — emitted programmatically, presented as the
investment ask, not an apology. Computed bits (sample share) come from
the data; the structural gaps are facts about what the export contains.
"""

from __future__ import annotations

from typing import Any

import pandas as pd


def gap_report(jobs: pd.DataFrame, company_turnover_gbp: float) -> list[dict[str, Any]]:
    full = jobs[~jobs["is_partial_period"] & jobs["is_closed"]]
    share = float(
        full.groupby("year")["sell_price_gbp"].sum().mean() / company_turnover_gbp
    )
    return [
        {
            "gap": "No capacity/utilisation data (press count, machine ID, availability)",
            "blocks": "Any absolute utilisation claim; any counterfactual GBP opportunity "
                      "figure; knowing when the constraint binds",
            "would_enable": "Conditional acceptance rule for short-notice work; real "
                            "opportunity costing",
        },
        {
            "gap": "No departmental labour split (Labour is one combined figure)",
            "blocks": "Measuring idle downstream labour; any labour-intensity ratio is a "
                      "proxy, labelled as such",
            "would_enable": "Line balancing; labour intensity by job type",
        },
        {
            "gap": "No cost-to-serve per order (estimating/admin/make-ready not charged "
                   "per job)",
            "blocks": "Any 'favour small jobs' conclusion; contribution flatters them",
            "would_enable": "True per-order profitability",
        },
        {
            "gap": "No scheduling-system data",
            "blocks": "Observing schedule disruption directly (rush flag is a dwell-time "
                      "proxy)",
            "would_enable": "Measured expediting cost",
        },
        {
            "gap": f"Sample is ~{share:.0%} of stated turnover",
            "blocks": "Extrapolation to company totals",
            "would_enable": "-",
        },
    ]
