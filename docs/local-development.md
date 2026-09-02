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

The test starts the app on an OS-selected port, verifies `/api/health`, verifies `/api/catalog/reference-designs`, and verifies the frontend HTML references the backend API.

## Catalog validation

```bash
python3 scripts/validate_catalog.py
```

Run this after changing files under `catalog/` or `data/`.
