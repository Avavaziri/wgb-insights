"""Config loading — every analytical parameter comes from config.yaml (§10)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]


def load_config(path: Path | None = None) -> dict[str, Any]:
    """Load config.yaml. Fails loudly if missing — no silent defaults."""
    cfg_path = path or REPO_ROOT / "config.yaml"
    with open(cfg_path, encoding="utf-8") as fh:
        cfg: dict[str, Any] = yaml.safe_load(fh)
    required = {"seeds", "fx", "product_type_map", "clean", "thresholds", "rush", "churn"}
    missing = required - cfg.keys()
    if missing:
        raise KeyError(f"config.yaml missing required sections: {sorted(missing)}")
    return cfg
