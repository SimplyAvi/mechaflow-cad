# MechaFlow CAD

MechaFlow CAD is an open-source robotics CAD orchestration cockpit. It helps a builder start from an existing design or design intent, choose units, author visual 3D assemblies on an XYZ grid, keep the target task visible, compare part and material changes, route wiring, and package the evidence a future CAD, FEA, electronics, or manufacturing worker needs.

This README is the canonical entry point for product and implementation planning. Treat it as the map for future work, not as a thin product overview.

## Product thesis and business logic

Robotics teams often begin with open mechanical designs, supplier parts, and shop knowledge, then lose time stitching together CAD edits, load assumptions, wiring changes, BOM updates, and quote packets. MechaFlow CAD should make that workflow explicit:

1. Start with a known project, a ready example, a user import, or a concise design intent.
2. Keep the engineering task active, such as payload, reach, cycle time, envelope, material, serviceability, or wiring constraints.
3. Let users inspect and change individual parts in context instead of treating geometry edits as isolated operations.
4. Show downstream consequences across analysis readiness, manufacturing, BOM, cost range, lead-time range, wiring, reports, and project files.
5. Preserve honest boundaries so advisory seed data, heuristics, pre-solver packages, solver fixtures, cloud plans, and future real solver outputs are never confused.

The business direction is cloud-assisted, not cloud-dependent. Local-first CAD previews, project files, and safe analysis packaging keep hosting cost low and protect user data. Cloud compute, paid supplier integrations, licensed standards packs, collaboration, and quote automation remain future optional layers that must be explicitly configured and approved. See [Business model](docs/business-model.md), [Cheap hosting plan](docs/hosting-plan.md), and [Data and standards strategy](docs/data-and-standards.md).

## Current MVP capabilities

The repository now contains a working local MVP foundation plus planning docs:

- A Vite, React, and TypeScript cockpit in `src/` with a visual-authoring-first opening, SVG XYZ grid, orbit/pan/zoom/explode controls, selectable and editable primitives, unit selection, motor and connector placement, visible wire routing, compact CAD-style sidebars, design intent command line, reference-image intake, project/example paths, and mode buttons for Design, Analysis, Manufacturing, Reports, and Backend surfaces.
- A Node mock backend in `scripts/mock-backend.mjs` for one-command desktop and frontend work.
- An Electron desktop-openable path in `desktop/` and `scripts/desktop-dev.mjs`, launched with `npm start`.
- A FastAPI backend in `backend/mechaflow_api/` with project, catalog, panel-data, material substitution, wiring/electronics, report, analysis-readiness, analysis job queue, project-file import/export, local pre-solver, and CalculiX solver-readiness fixture contracts.
- Portable `.mfcad.json` project files that round-trip units, authored visual geometry metadata, assemblies, wiring, MVP project state, and cached evidence metadata.
- Seed catalog, material, manufacturing, integration, ready-example, task, and handoff data in `catalog/` and `data/`.
- CI-backed validation for Python, catalog, frontend, smoke, and captain desktop smoke paths.

## Honest limitations

Do not claim these capabilities exist until code and validation prove them:

- No photo-to-3D, prompt-to-CAD, or parametric CAD generation exists. Reference images and design prompts are local intake metadata and concept guidance only. The current 3D workspace authors SVG visual primitives and persists their project metadata.
- No full project FEA exists. The pre-solver runner creates review-required packages and optional nominal demo screening. The CalculiX fixture can prove local executable plumbing for a generated tiny deck, but it does not analyze the selected project geometry.
- No cloud compute is configured. Queue recommendations may say cloud would be useful when configured, but remote execution, credentials, billing, budget guardrails, and provider approvals are absent.
- No exact supplier quote, purchase flow, or paid API dependency exists. Cost and lead time are ranged seed estimates.
- No exact electrical validation exists. Wiring review is deterministic MVP heuristics for recorded route data, not voltage drop, EMI, flex-life, current-rating, standards, or CAD clearance certification.
- No external CAD assets are vendored. Ready examples are repository-local seed data unless a future task imports license-cleared assets.

## Target user workflows

### Opening workflow

The product direction is visual-authoring first, input-first, and 3D-first:

1. Land directly in the visual CAD workspace, not a long setup checklist.
2. Choose millimeters, centimeters, meters, or inches as working units.
3. Create base plates, beams, joints, brackets, motors, connectors, electronics blocks, or tool plates on the XYZ grid.
4. Select geometry, edit dimensions and position, connect parent and joint metadata, and route visible wire polylines between parts.
5. Type a design intent in one command line and receive extracted chips when possible.
6. Add reference photos or images as local metadata without any reconstruction claim.
7. Choose one project path from the left sidebar: new prompt concept, open/import `.mfcad.json`, recent project, reference catalog, or repository-local ready example.
8. Use contextual sidebars instead of modal-heavy setup screens.

### In-cockpit workflow

1. Orbit, pan, zoom, explode, and inspect the robot arm assembly.
2. Select a part from the visual model or model tree.
3. Create or edit visual primitives, place motors and connectors, and route visible wiring as persisted review-required project data.
4. Review task criteria, material, manufacturing, stiffness, heat, source confidence, review-required values, and linked wiring data.
5. Preview compatible material and process substitutions before applying them.
6. Check downstream panels for BOM, manufacturing, wiring/electronics, pre-solver readiness, queue recommendations, and reports.
7. Export and import a `.mfcad.json` file so the desktop workflow can be saved, reopened, and shared.

Read [User experience](docs/user-experience.md), [Frontend development](docs/frontend.md), and [Desktop demo](docs/desktop.md) before changing these flows.

## Code architecture and implementation surfaces

Use [Technical architecture](docs/technical-architecture.md) as the architectural source, then verify details against code.

- `src/App.tsx`, `src/App.css`, `src/lib/`, and `src/data/` implement the React cockpit, API client, backend mapping, design-intent parsing, local mocks, ready examples, and component tests.
- `scripts/mock-backend.mjs` and `scripts/mock-backend-data.mjs` provide backend-shaped data and mutation paths for `npm run dev:full`, `npm start`, smoke tests, and desktop demo work.
- `desktop/main.cjs` plus `scripts/desktop-dev.mjs`, `scripts/desktop-smoke.mjs`, and `scripts/captain-demo-smoke.mjs` provide the Electron shell and captain-friendly desktop validation path.
- `backend/mechaflow_api/models.py` is the authoritative backend schema surface for projects, assemblies, parts, materials, tasks, manufacturing, wiring, reports, readiness, job queues, project files, and integration metadata.
- `backend/mechaflow_api/main.py` exposes FastAPI endpoints. `services.py`, `storage.py`, `job_queue.py`, `runners.py`, `solver_execution.py`, `adapters.py`, and `catalog.py` hold business rules, in-memory persistence boundaries, queue recommendations, local-safe analysis packaging, fixture execution, integration stubs, and seed loading.
- `frontend/` is a tiny static integration shell used by the Python local app and smoke path. Product cockpit work belongs in `src/` unless the backend/static smoke surface itself is in scope.
- `src/mechaflow_cad/app.py` is the standard-library catalog API and static shell for the local seed app.
- `catalog/`, `data/`, and `catalog/schemas/` are machine-readable planning and demo inputs. Validate catalog changes with `python scripts/validate_catalog.py`.

## Authoritative planning docs

Read these before scoping significant work:

1. [Product requirements](docs/product-requirements.md) - mission, business rules, MVP requirements, deliverables, non-goals, and acceptance criteria.
2. [User experience](docs/user-experience.md) - visual-authoring cockpit direction, target workflows, interaction style, and honest analysis copy.
3. [Technical architecture](docs/technical-architecture.md) - current code architecture, target worker architecture, contracts, data model, and boundaries.
4. [MVP roadmap](docs/mvp-roadmap.md) - what is complete, what is only a safe MVP boundary, and what future milestones require.
5. [Backend development](docs/backend.md), [Frontend development](docs/frontend.md), and [Desktop demo](docs/desktop.md) - implementation details and local workflows.
6. [Project files](docs/project-files.md), [Wiring and electronics MVP](docs/wiring-electronics.md), and [Local solver execution and readiness](docs/local-solver-execution.md) - current boundary docs for major product surfaces.
7. [Validation policy](docs/validation.md) - local and CI validation requirements.
8. [Reference design catalog](docs/reference-design-catalog.md), [Integration adapter plan](docs/integrations/README.md), [Dependency license verification](docs/dependency-license-verification.md), and [Open-source integration candidates](docs/open-source-integrations.md) - source, license, and future adapter constraints.

Machine-readable seeds:

- `catalog/reference-designs/reference-designs.seed.json`
- `catalog/schemas/reference-design.schema.json`
- `data/*.seed.json`, including integration adapters, backend/frontend handoff projections, materials, manufacturing methods, ready examples, and task records

## Worker planning map

Before implementing a task:

1. Read this README and the linked planning doc that owns the product surface you will touch.
2. Inspect the current code path and tests for that surface. Do not rely on docs alone.
3. Preserve the business rule behind the feature. For example, a material substitution is not just UI state; it affects active task context, part metadata, BOM, manufacturing, readiness, reports, import/export, and validation labels.
4. Keep implementation claims synchronized across root README, owner docs, code, seed data, and tests when the scope changes.
5. Avoid duplicating large blocks. Link to the owner doc, then summarize only the decision a future worker needs.
6. Keep limitations explicit. Do not remove review-required, planning-only, not-FEA, estimate, or heuristic labels unless a real implementation and validation path replaced them.
7. Run the validation commands from [Validation policy](docs/validation.md) that match the changed surfaces, plus the full local policy before handoff when practical.

## Local quick start

Use Node.js matching `package.json` and Python 3.11 or newer.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[dev]'
npm ci
```

Open the desktop MVP:

```bash
npm start
```

Run the local FastAPI backend on a known port:

```bash
export MECHAFLOW_API_PORT=8123
mechaflow-api
```

Run the Vite cockpit against that backend:

```bash
export VITE_API_BASE_URL=http://127.0.0.1:8123
npm run dev -- --host 127.0.0.1 --port 5173
```

Run backend and static shell together, or frontend and mock backend together:

```bash
python scripts/run-dev.py
npm run dev:full
```

Run the standard-library local app path:

```bash
PYTHONPATH=src MECHAFLOW_PORT=0 python3 -m mechaflow_cad.app
PYTHONPATH=src python3 tests/smoke_test.py
```

## Validation expectations

For a full local handoff after dependencies are installed, run:

```bash
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

Docs-only changes should still run the available documentation/link check, catalog validation, backend tests, and frontend checks needed to prove links, examples, scripts, and changed claims remain accurate. GitHub Actions runs the CI-safe subset on pull requests and pushes to `main`. See [Validation policy](docs/validation.md).

## Repository status

PR #1 through PR #12 have landed through `main`; this branch adds the visual CAD authoring MVP on top of that foundation. The current MVP is a local, desktop-openable, seed-backed orchestration demo with honest integration boundaries. Future work should tighten real FreeCAD import, parametric CAD generation, Gmsh meshing, CalculiX project solving, cloud execution policy, supplier integrations, and licensed standards only after the relevant product and safety requirements are explicit.

## License

The documentation and source code are MIT licensed unless changed by project maintainers.
