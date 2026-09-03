# Local Development

MechaFlow CAD has three local MVP surfaces that share the same handoff concepts:

- The FastAPI backend in `backend/mechaflow_api` exposes project orchestration, panel data, reference design, worker, and report contracts. See `docs/backend.md`.
- The React cockpit in `src/` is the product frontend lane. It can use bundled mock data, the Node mock API, or a running FastAPI backend through `VITE_API_BASE_URL`. See `docs/frontend.md`.
- The catalog seed app in `src/mechaflow_cad` runs the static integration shell from `frontend/` and the catalog API together from one Python standard-library process. This keeps early hosting cheap and avoids required paid dependencies.

## Run the catalog app

Use an OS-selected unused port:

```bash
PYTHONPATH=src MECHAFLOW_PORT=0 python3 -m mechaflow_cad.app
```

The server prints the chosen URL, for example:

```text
MechaFlow CAD seed app serving frontend and API at http://127.0.0.1:54321
```

Open that URL in a browser. The static shell fetches the backend catalog API from the same origin at `/api/catalog/reference-designs`. When the same `frontend/` shell is served by `python scripts/run-dev.py`, `/runtime-config.js` points it at the FastAPI backend instead.

## Choose an explicit port

If you need a stable port for another tool, set it explicitly:

```bash
PYTHONPATH=src MECHAFLOW_HOST=127.0.0.1 MECHAFLOW_PORT=8765 python3 -m mechaflow_cad.app
```

If the configured port is busy, the app fails clearly and tells you to select another port. It does not silently collide with another local project.

## Find an unused port

```bash
python3 scripts/find-free-port.py
```

Then pass the printed value as `MECHAFLOW_PORT`. For fully automatic local runs and tests, prefer `MECHAFLOW_PORT=0`.

## Smoke test

Run the catalog end-to-end smoke test:

```bash
PYTHONPATH=src python3 tests/smoke_test.py
```

The test starts the app on an OS-selected port (override with `MECHAFLOW_PORT`), verifies the health,
metadata, reference-design, adapter, handoff, and runtime configuration contracts, and confirms unknown
and path-traversal requests return `404`.

It then runs `tests/frontend_smoke.mjs`, which discovers the module the served page loads, imports it
under browser-like globals so the page bootstrap in `frontend/app.js` runs on its own, and asserts the
entries it renders match `/api/catalog/reference-designs` and `/api/data/tasks` on the same configurable
base URL. Node.js is the only extra requirement, and it is an open-source test-only dependency: the app
itself still runs on the Python standard library alone.

## Catalog validation

```bash
python3 scripts/validate_catalog.py
```

Run this after changing files under `catalog/` or `data/`. For focused regression coverage, also run `python3 -m unittest discover -s tests -p 'test_seed_data_validation.py'` after installing development dependencies.
