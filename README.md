# MechaFlow CAD

MechaFlow CAD is an open-source product concept for a robotics-focused CAD orchestration platform.

The goal is to help people start from free and open reference designs, inspect animated exploded views, select individual parts, modify dimensions or materials, and automatically re-check whether the design still satisfies the original task.

Example: open a robot hand or gripper design, set the task to "pick and place a 50 lb object", select a finger link, swap aluminum for a carbon-fiber nylon or steel option, and get updated payload capability, weight, cost, manufacturability, wiring, and maintenance guidance.

## What this repository contains

This repository contains product and technical documentation plus an integrated local MVP foundation: a FastAPI backend, a Vite React TypeScript frontend cockpit, and catalog/integration fixtures and validation.

- [Frontend development](docs/frontend.md)
- [Product requirements](docs/product-requirements.md)
- [Technical architecture](docs/technical-architecture.md)
- [User experience](docs/user-experience.md)
- [Reference design catalog](docs/reference-design-catalog.md)
- [Open-source integration candidates](docs/open-source-integrations.md)
- [Integration adapter plan](docs/integrations/README.md)
- [Dependency license verification](docs/dependency-license-verification.md)
- [Local development](docs/local-development.md)
- [Desktop demo](docs/desktop.md)
- [Business model](docs/business-model.md)
- [Cheap hosting plan](docs/hosting-plan.md)
- [MVP roadmap](docs/mvp-roadmap.md)
- [Data and standards strategy](docs/data-and-standards.md)
- [Backend development](docs/backend.md)
- [Local solver execution](docs/local-solver-execution.md)

Machine-readable seeds:

- `catalog/reference-designs/reference-designs.seed.json`
- `catalog/schemas/reference-design.schema.json`
- `data/*.seed.json`, including adapter and backend/frontend handoff projections

## Core product idea

MechaFlow CAD should become an engineering cockpit that connects:

1. Mechanical CAD
2. Open reference design catalogs
3. Animated exploded views
4. Part-level editing
5. Material substitution
6. Standards-aware design suggestions
7. Finite element analysis and other simulations
8. Electronics and wire harness planning
9. Manufacturing and supplier recommendations
10. Cost, lead-time, and serviceability analysis

## MVP recommendation

The first useful demo should not start with a blank CAD canvas.

It should start with an existing open-source robot hand, gripper, arm, drone, fixture, or automation design.

The MVP should:

1. Import an open reference design.
2. Parse the assembly into selectable parts and subassemblies.
3. Show an animated exploded view.
4. Let the user select one part and understand what it does.
5. Let the user change material, length, thickness, or manufacturing process.
6. Keep the original task active, such as lifting 50 lb.
7. Re-rate the design after the change, such as "still supports 50 lb", "now supports 100 lb", or "reduced to 25 lb".
8. Queue background checks for FEA, fit, wiring, mass, cost, and manufacturing.
9. Generate a report with pros, cons, risks, and next actions.

## Open-source first

The intended foundation should use open-source components wherever possible. Required runtime dependencies must not be closed-source or paid-only, and every GitHub project or design asset must pass the license checklist before adoption.

Candidate foundations include:

- FreeCAD for parametric CAD and geometry automation.
- OpenCascade through FreeCAD for solid modeling.
- CalculiX and Gmsh for structural simulation and meshing.
- KiCad and KiCadStepUp for electronics and ECAD/MCAD exchange.
- WireViz for wiring harness documentation.
- ROS 2, URDF, and related tools for robot motion models.
- Open standard-part libraries where licensing permits reuse.

Some engineering standards are not freely redistributable.

The platform should clearly separate open advisory rules from licensed authoritative standards packs.

## Local seed app

Run the frontend and backend catalog API together with no required third-party runtime dependencies:

```bash
PYTHONPATH=src MECHAFLOW_PORT=0 python3 -m mechaflow_cad.app
```

The process prints the selected URL. Use `python3 scripts/find-free-port.py` when you need an explicit unused port.

The local API exposes reference designs at `/api/catalog/reference-designs` and each dataset at `/api/data/{dataset}`, including `integration-adapters` and `backend-frontend-handoff`.

Exercise the standard-library app path:

```bash
PYTHONPATH=src python3 tests/smoke_test.py
```

After installing the development dependencies, validate catalog data and its focused regression coverage:

```bash
python3 scripts/validate_catalog.py
python3 -m unittest discover -s tests -p 'test_seed_data_validation.py'
```

The smoke test additionally needs Node.js matching `^22.22.2 || ^24.15.0 || >=26.0.0`, an open-source
test-only dependency: it runs the frontend
module's page bootstrap against the live backend API and asserts what the page renders.

## Hosting philosophy

Keep hosting cheap by making the platform cloud-assisted rather than cloud-dependent.

- Run CAD editing, local previews, and simple checks on the user's computer when possible.
- Use cheap static hosting for the frontend.
- Use a small API server for accounts, project metadata, and job coordination.
- Use cloud compute only for heavy simulation jobs or collaboration.
- Support bring-your-own AI keys during early prototypes to control cost.

## Integrated local MVP quick start

Backend dependencies are managed by Python packaging, while frontend dependencies are managed by npm.
Use Node.js matching the `engines.node` requirement in `package.json`.

To open the local desktop demo after installing npm dependencies:

```bash
npm start
```

This starts the mock API, Vite frontend, and an Electron desktop window identified as MechaFlow CAD for the interactive robot arm visual MVP with exploded-view, orbit, part-selection controls, and pre-solver analysis readiness panels. On macOS, `npm run desktop:macos:shortcut` installs a double-clickable Finder launcher. See [Desktop demo](docs/desktop.md).

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[dev]'
npm ci
```

Run backend, catalog, frontend, smoke, and desktop/captain checks:

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

GitHub Actions runs the CI-safe subset of these checks on pull requests and pushes to `main`. See [Validation policy](docs/validation.md) for the CI workflow, local commands, and the manual desktop demo check that remains release-readiness evidence.

Run the backend on an explicit local port:

```bash
export MECHAFLOW_API_PORT=8123
mechaflow-api
```

Run the Vite product cockpit on an explicit local port and point it at the FastAPI backend:

```bash
export VITE_API_BASE_URL=http://127.0.0.1:8123
npm run dev -- --host 127.0.0.1 --port 5173
```

Or run local helpers that choose available ports:

```bash
python scripts/run-dev.py
npm run dev:full
```

`python scripts/run-dev.py` serves the static integration shell in `frontend/` against the FastAPI backend. `npm run dev:full` serves the React cockpit in `src/` against the Node mock backend used for frontend work. The catalog seed app can also serve `frontend/` and the catalog API together:

```bash
PYTHONPATH=src MECHAFLOW_PORT=0 python3 -m mechaflow_cad.app
```

Use `python scripts/find-free-port.py` for one unused port or `node scripts/find-ports.mjs` for one or more before setting `MECHAFLOW_API_PORT`, `MECHAFLOW_FRONTEND_PORT`, `MECHAFLOW_PORT`, or the Vite dev server port. See [Backend development](docs/backend.md), [Frontend development](docs/frontend.md), and [Local development](docs/local-development.md) for details.

## Repository status

This repository now contains planning documents and an integrated local MVP foundation. The backend exposes CAD orchestration, analysis-readiness, report, worker, and catalog-shaped contracts, including a local pre-solver runner and a CalculiX solver-readiness fixture boundary; see [Backend development](docs/backend.md) and [Local solver execution](docs/local-solver-execution.md). The frontend cockpit can use backend-shaped mock data or a running API. The desktop-friendly visual seed shows a robot arm assembly with honest demo criteria, explicit pre-solver load cases, material and thermal provenance, expected FreeCAD, Gmsh, and CalculiX artifacts, local solver tool availability, and no fake FEA claims. Full project FEA still requires FreeCAD geometry prep, Gmsh meshing, CalculiX solving, and engineering review before stress, displacement, safety factor, or payload ratings can be treated as real solver outputs.

## License

The documentation and future source code are intended to be open source.

The initial license is MIT unless changed before implementation begins.
