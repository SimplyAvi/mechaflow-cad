# Validation policy

MechaFlow CAD keeps pull-request validation local-first and CI-safe. CI runs only open-source checks that need no secrets, paid services, solver licenses, deployment credentials, or desktop user session.

## CI coverage

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on pull requests and pushes to `main`.

### Python, catalog, and local app smoke

CI installs the backend package with development dependencies and runs:

```sh
pytest
python scripts/validate_catalog.py
python -m unittest discover -s tests -p 'test_seed_data_validation.py'
PYTHONPATH=src python tests/smoke_test.py
```

This covers FastAPI contracts, Pydantic schemas, seed data, catalog validation, and the standard-library local app smoke path. The smoke path also installs npm dependencies because it imports the served frontend module under browser-like globals.

### Frontend, mock API, and captain smoke

CI installs npm dependencies and runs:

```sh
npm run lint
npm test
npm run build
npm run smoke
xvfb-run -a npm run captain:smoke
```

These commands cover TypeScript compilation, Vite production build, React unit and component tests, frontend lint, the mock API plus built frontend smoke, and the captain demo smoke. React tests include visual authoring coverage for unit selection, primitive creation, dimension editing, parent and joint metadata, and visible wire routing. `captain:smoke` includes the Electron desktop launcher smoke, fixture import, material substitution preview, local-safe analysis endpoints, solver-unavailable boundary, and project-file export round trip.

## Local validation before handoff

Use the same project-owned commands locally before opening a PR:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[dev]'
npm ci
pytest
python scripts/validate_catalog.py
python -m unittest discover -s tests -p 'test_seed_data_validation.py'
PYTHONPATH=src python3 tests/smoke_test.py
npm run lint
npm test
npm run build
npm run smoke
npm run captain:smoke
```

## Manual desktop demo coverage

CI uses `xvfb-run` to provide a headless display for the Electron smoke path and disables Electron's Linux setuid sandbox only for the GitHub-hosted runner, where the downloaded helper cannot retain its required ownership and mode. That proves the one-command desktop launcher can start the mock API, Vite frontend, and Electron shell noninteractively without claiming a full desktop security environment.

CI does not replace a human visual review of the desktop cockpit. Before release handoff, run the manual checklist in `docs/desktop.md` with `npm start` and inspect the actual window for layout, XYZ grid clarity, orbit/pan/zoom feel, part creation, geometry selection, dimension controls, motor and connector placement, visible wire routing, material controls, downstream panels, analysis queue labels, reports, and project-file import/export behavior.

## Unsuitable checks for CI

The full manual desktop demo requires a visible desktop session and human inspection, so it remains a local/manual release-readiness check. Real project FEA is also outside CI because the MVP does not require FreeCAD, Gmsh, CalculiX, cloud providers, licensed standards packs, billing policy, or solver credentials. CI keeps those paths honest by exercising the documented local-safe pre-solver package and solver-unavailable states instead of faking solver success.
