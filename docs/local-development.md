# Local Development

The seed app runs the frontend and backend API together from one Python standard-library process. This keeps early hosting cheap and avoids required paid dependencies.

## Run the catalog app

Use an OS-selected unused port:

```bash
PYTHONPATH=src MECHAFLOW_PORT=0 python3 -m mechaflow_cad.app
```

The server prints the chosen URL, for example:

```text
MechaFlow CAD seed app serving frontend and API at http://127.0.0.1:54321
```

Open that URL in a browser. The frontend fetches the backend catalog API from the same origin.

## Choose an explicit port

If you need a stable port for another tool, set it explicitly:

```bash
PYTHONPATH=src MECHAFLOW_HOST=127.0.0.1 MECHAFLOW_PORT=8765 python3 -m mechaflow_cad.app
```

If the configured port is busy, the app fails clearly and tells you to select another port. It does not silently collide with another local project.

## Find an unused port

```bash
python3 scripts/find_unused_port.py
```

Then pass the printed value as `MECHAFLOW_PORT`. For fully automatic local runs and tests, prefer `MECHAFLOW_PORT=0`.

## Smoke test

Run the end-to-end smoke test:

```bash
python3 tests/smoke_test.py
```

The test starts the app on an OS-selected port (override with `MECHAFLOW_PORT`), verifies `/api/health`,
verifies `/api/catalog/reference-designs`, and verifies that the static frontend cannot serve files
outside `frontend/`.

It then runs `tests/frontend_smoke.mjs`, which discovers the module the served page loads, imports it
under browser-like globals so the page bootstrap in `frontend/app.js` runs on its own, and asserts the
cards it renders match `/api/catalog/reference-designs` and `/api/data/tasks` on the same configurable
base URL. Node.js is the only extra requirement, and it is an open-source test-only dependency: the app
itself still runs on the Python standard library alone.

## Catalog validation

```bash
python3 scripts/validate_catalog.py
```

Run this after changing files under `catalog/` or `data/`.
