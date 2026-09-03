# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Backend setup, configurable local ports, integration stubs, and test commands are documented in `docs/backend.md`.
- Run backend validation with `pytest` after installing `.[dev]` dependencies in a virtual environment.
- Frontend setup, configurable ports, local mock backend, and smoke test commands are documented in `docs/frontend.md`.
- Seed catalog, integration contracts, and handoff projections are documented in `docs/reference-design-catalog.md`, `docs/integrations/README.md`, `docs/dependency-license-verification.md`, `data/integration-adapters.seed.json`, and `data/backend-frontend-handoff.seed.json`.
- Validate catalog changes with `python3 scripts/validate_catalog.py`; run `python3 -m unittest discover -s tests -p 'test_seed_data_validation.py'` and the local frontend plus backend smoke path with `PYTHONPATH=src python3 tests/smoke_test.py` (Node.js is needed for the browser-like frontend proof).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
