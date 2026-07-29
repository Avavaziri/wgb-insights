# Run inside the wgb-insights environment (conda activate wgb-insights).
PY ?= python

.PHONY: test verify api web refresh lint assets fixture

test:
	$(PY) -m pytest

verify:
	$(PY) verify.py

api:
	$(PY) -m uvicorn api.main:app --reload --port 8000

web:
	cd frontend && pnpm dev

refresh: verify

lint:
	$(PY) -m ruff check src api tests scripts
	$(PY) -m mypy src api

assets:
	$(PY) export_assets.py

fixture:
	$(PY) scripts/make_fixture.py
