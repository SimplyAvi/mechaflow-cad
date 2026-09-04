# Frontend development

The first MechaFlow CAD frontend is a Vite, React, and TypeScript application. It is intentionally lightweight and uses local CSS so a formal design system can replace the visual layer later.

## What the cockpit demonstrates

The initial UI is useful before FreeCAD, KiCad, FEA, or supplier workers exist. It includes mocked orchestration data for:

- Opening an open reference robot gripper design.
- Viewing an animated exploded assembly concept.
- Selecting parts from the assembly and part tree.
- Preserving the active task while previewing material substitution.
- Keeping payload capability and safety factor under review until a backend worker supplies a task-independent rating.
- Showing background CAD, FEA, wiring, and supplier job status.
- Reviewing BOM, cost, manufacturing, and lead-time panels.
- Surfacing wiring routes, bend radius, service loops, and clearance risk.
- Mirroring the backend project, panel-data, modification preview, report, catalog, and metadata contracts.

## Install

Use Node.js matching `^22.22.2 || ^24.15.0 || >=26.0.0`, as declared in `package.json`.

```sh
npm ci
```

## Configurable ports

Developers often run multiple local projects, so choose ports explicitly when possible. The frontend accepts both short local names and the backend handoff names.

Frontend variables:

- `MECHAFLOW_FRONTEND_PORT`: preferred frontend dev or preview port.
- `FRONTEND_PORT`: shorter alias.
- `PORT`: fallback frontend port understood by many hosts.
- `MECHAFLOW_FRONTEND_HOST` or `FRONTEND_HOST`: host bind address, default `127.0.0.1`.

Mock or real backend variables:

- `MECHAFLOW_API_PORT`: preferred API port when using the backend scaffold.
- `BACKEND_PORT`: shorter mock-backend alias.
- `API_PORT`: fallback mock API alias.
- `MECHAFLOW_API_HOST` or `BACKEND_HOST`: host bind address, default `127.0.0.1`.

Vite is configured with `strictPort: true`. If the selected frontend port is busy, startup fails clearly instead of silently moving to another port. Pick another port with `MECHAFLOW_FRONTEND_PORT`, `FRONTEND_PORT`, or use the helper below.

Find currently unused local ports:

```sh
npm run ports:find
```

Example with explicit ports:

```sh
MECHAFLOW_API_PORT=7331 MECHAFLOW_FRONTEND_PORT=7332 npm run dev:full
```

If either port is busy, choose another pair:

```sh
PORT_COUNT=4 npm run ports:find
```

## Run only the frontend

The frontend can run without a backend by using bundled backend-shaped mock panel data:

```sh
MECHAFLOW_FRONTEND_PORT=7332 npm run dev
```

Open the URL printed by Vite.

## Run frontend and mock backend together

Use the integrated local stack for frontend-to-backend development:

```sh
MECHAFLOW_API_PORT=7331 MECHAFLOW_FRONTEND_PORT=7332 npm run dev:full
```

This starts:

- Mock API at `http://127.0.0.1:$MECHAFLOW_API_PORT`.
- Vite frontend at `http://127.0.0.1:$MECHAFLOW_FRONTEND_PORT`.
- `VITE_API_BASE_URL` wired to the mock API.

You can also run both processes manually:

```sh
MECHAFLOW_API_PORT=7331 npm run mock:api
VITE_API_BASE_URL=http://127.0.0.1:7331 MECHAFLOW_FRONTEND_PORT=7332 npm run dev
```

## Checks and tests

Type-check and build:

```sh
npm run build
```

Unit and component tests:

```sh
npm test
```

End-to-end local smoke test:

```sh
npm run smoke
```

The smoke test chooses unused ports unless `MECHAFLOW_API_PORT` and `MECHAFLOW_FRONTEND_PORT` are set. It starts the mock backend, verifies `/health`, `/api/metadata`, and `/api/projects/sample/panel-data`, builds the frontend with `VITE_API_BASE_URL`, starts Vite preview, executes the built app in a browser-like DOM, and verifies the rendered cockpit loaded project panel data from the configured backend.

## Backend contract mirrored by the frontend

The frontend loads from `VITE_API_BASE_URL` when it is set. It first requests:

```text
GET /api/metadata
GET /api/projects/project-open-gripper-demo/panel-data
```

`/api/projects/{project_id}/panel-data` should return the backend `ProjectPanelData` shape containing:

- `project`: active task, assemblies, materials, analysis jobs, modifications, and reports.
- `task_requirements`: active task rows for task-preserving UI.
- `bom_items`: BOM rows for cost and sourcing panels.
- `manufacturing_options`: part-grouped manufacturing choices.
- `wiring_routes`: connector-to-connector harness routes.
- `reports`: advisory summaries from local modification previews or workers.

The frontend also displays the intended mutation endpoint without requiring a write during normal UI use:

```text
POST /api/projects/{project_id}/modifications
```

The preview payload mirrors the backend `Modification` contract: `target_part_id`, optional `material_id`, optional `dimension_changes`, and optional `manufacturing_process`. A real backend response should attach an advisory report until CAD, FEA, wiring, and supplier workers produce authoritative artifacts.

The bundled mock lives in `src/data/backendPanelData.json` and follows the backend handoff concepts from the local FastAPI scaffold. The Node mock API in `scripts/mock-backend.mjs` serves the same data for frontend-to-backend development.

## Connecting to a real backend later

Run or deploy the backend scaffold, then start the frontend with:

```sh
VITE_API_BASE_URL=https://your-api.example MECHAFLOW_FRONTEND_PORT=7332 npm run dev
```

Until the backend is available, or if it fails during local development, the app falls back to bundled mock panel data so frontend work is not blocked by FreeCAD or cloud compute integrations.
