"""In-memory result cache keyed on uploaded-file hash (§4).

Local only, no database: uploading the same bytes twice reuses the
cached PipelineResult; a new file recomputes everything. On first
request with no upload, the server bootstraps from data/raw/ (or the
committed synthetic fixture, so the app runs without the real data).
"""

from __future__ import annotations

import hashlib
import tempfile
import threading
from pathlib import Path

from src.pipeline import PipelineResult, run_pipeline

REPO = Path(__file__).resolve().parents[1]

_lock = threading.Lock()
_cache: dict[str, PipelineResult] = {}
_active_hash: str | None = None


def _default_path() -> Path:
    raw = sorted((REPO / "data" / "raw").glob("*.xlsx"))
    if raw:
        return raw[0]
    return REPO / "data" / "sample" / "sample.xlsx"


def file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def ingest_bytes(data: bytes, filename: str) -> tuple[str, PipelineResult]:
    """Run (or reuse) the pipeline for uploaded bytes; make it active."""
    global _active_hash
    key = file_hash(data)
    with _lock:
        if key not in _cache:
            with tempfile.NamedTemporaryFile(
                suffix=f"__{Path(filename).name}", delete=False
            ) as tmp:
                tmp.write(data)
                tmp_path = Path(tmp.name)
            try:
                _cache[key] = run_pipeline(tmp_path)
            finally:
                tmp_path.unlink(missing_ok=True)
        _active_hash = key
    return key, _cache[key]


def active() -> PipelineResult:
    """The current result; bootstraps from disk on first call."""
    global _active_hash
    with _lock:
        if _active_hash is None:
            path = _default_path()
            key = file_hash(path.read_bytes())
            if key not in _cache:
                _cache[key] = run_pipeline(path)
            _active_hash = key
        return _cache[_active_hash]
