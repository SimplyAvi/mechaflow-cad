# Frontend development

The first MechaFlow CAD frontend is a Vite, React, and TypeScript application. It is intentionally lightweight and uses local CSS so a formal design system can replace the visual layer later.

## What the cockpit demonstrates

The initial UI is useful before FreeCAD, KiCad, FEA, or supplier workers exist. It includes mocked orchestration data for:

- Opening a bundled robot arm visual MVP with a wrist gripper.
- Viewing an interactive exploded assembly concept with desktop-demo orbit, yaw, pitch, and explode controls.
- Selecting parts from the assembly and part tree with visual highlighting tied to the inspector.
- Preserving the active task while comparing compatible material and manufacturing substitutions.
- Previewing backend substitution effects before apply, with non-persisted preview panels clearly separated from persisted project mutation.
- Keeping payload capability and safety factor under review until a backend worker supplies a task-independent rating.
- Showing plain-English part criteria for load role, material, stiffness, heat limit, manufacturing process, source confidence, and review-required values.
- Showing selected-part and selected-assembly pre-solver analysis readiness with explicit load cases, constraints, material provenance, thermal guidance, expected FreeCAD, Gmsh, and CalculiX artifacts, and review-required notes. Assembly fallback previews aggregate included parts and do not copy part-level demo estimates.
- Showing a professional analysis job queue panel with pending, running, completed, failed, solver-unavailable, and review-required states; local/cloud recommendation copy; planning-only cost and wait estimates; cached reports; and downloadable local artifact links when available.
- Triggering the FastAPI local pre-solver runner when `VITE_API_BASE_URL` points at the backend. The button creates a persisted review-required artifact and keeps it labeled as not FEA.
- Inspecting local FreeCAD, Gmsh, and CalculiX availability through the solver-readiness endpoint, then running a deterministic CalculiX fixture boundary when available or showing exact missing-tool guidance when unavailable.
- Exporting and importing portable `.mfcad.json` project files when the cockpit is connected to the FastAPI backend or desktop mock API.
- Reviewing BOM, cost, manufacturing, and lead-time panels where substitutions visibly change ranged estimates without inventing exact quotes.
- Surfacing a wiring/electronics workflow with route summaries, connector details, linked electronics, wire segments, harness BOM additions, heuristic clearance and bend-radius evidence, and a simple route diagram.
- Mirroring the backend project, panel-data, wiring review, modification preview, report, catalog, and metadata contracts.

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
- `MECHAFLOW_CORS_ORIGINS`: comma-separated browser origins allowed by the Node mock, defaulting to Vite on `127.0.0.1:5173` and `localhost:5173`.

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

## Open as a local desktop app

The captain-friendly desktop path starts the mock API, Vite frontend, and Electron shell in one command:

```sh
npm start
```

`npm run desktop:macos:shortcut` installs a double-clickable macOS `.command` launcher for the same path. See [Desktop demo](desktop.md) for visual test steps, toolchain rationale, and the smoke check.

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
MECHAFLOW_API_PORT=7331 MECHAFLOW_CORS_ORIGINS=http://127.0.0.1:7332 npm run mock:api
VITE_API_BASE_URL=http://127.0.0.1:7331 MECHAFLOW_FRONTEND_PORT=7332 npm run dev
```

`npm run dev:full` supplies its selected frontend origin to the mock automatically.
Browser mutation requests to the mock must come from an origin allowed by `MECHAFLOW_CORS_ORIGINS`, and
JSON mutation bodies must use `Content-Type: application/json`.

## Checks and tests

Type-check and build:

```sh
npm run build
```

Unit and component tests:

```sh
npm test
```

Desktop shell smoke test:

```sh
npm run desktop:smoke
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
- `electronics_components`: PCBs, sensors, service disconnects, and connector accessories linked to parts.
- `wire_segments`: conductors or cable bundles with length estimates, AWG, endpoint references, and BOM item ids.
- `wiring_rules`: explicit heuristic thresholds for clearance, bend radius, and service-loop slack.
- `wiring_routes`: connector-to-connector harness routes with basic geometry and WireViz diagram references.
- `wiring_review`: deterministic MVP `pass`, `warning`, or `review_required` route evidence. These are heuristic screening results, not exact electrical or CAD validation.
- `reports`: advisory summaries from local modification previews or workers.
- `analysis_readiness_previews`: optional pre-solver readiness previews keyed by part or assembly id. When omitted, the frontend derives clearly labeled local previews from the same part, material, and task fields for demo continuity; assembly fallbacks aggregate all included parts and remain review-required when aggregate inputs are incomplete.
- `analysis_job_queue`: optional enriched queue rows with execution recommendations, cached artifact references, cached report references, and estimate metadata. When omitted, the frontend still renders base `project.analysis_jobs` but labels recommendations as unavailable.

The frontend also displays readiness endpoints, can save and reopen project files, can preview/apply material substitutions, and, when connected to FastAPI, can trigger the local pre-solver runner:

```text
GET /api/projects/{project_id}/export-file
POST /api/projects/import-file
GET /api/projects/{project_id}/analysis-readiness/{target_id}
POST /api/projects/{project_id}/analysis-readiness/previews
GET /api/projects/{project_id}/parts/{part_id}/material-substitutions
POST /api/projects/{project_id}/material-substitutions/preview
POST /api/projects/{project_id}/material-substitutions/apply
GET /api/projects/{project_id}/wiring-electronics
POST /api/projects/{project_id}/wiring-review
GET /api/projects/{project_id}/electronics-components
GET /api/projects/{project_id}/wire-segments
GET /api/projects/{project_id}/wiring-rules
GET /api/projects/{project_id}/analysis-job-queue
GET /api/projects/{project_id}/analysis-jobs
POST /api/projects/{project_id}/analysis-jobs/recommendation
POST /api/projects/{project_id}/analysis-jobs/pre-solver-runs
GET /api/local-analysis/tool-boundaries
GET /api/local-analysis/solver-readiness
POST /api/projects/{project_id}/analysis-jobs/solver-readiness-runs
```

The project file controls in the reference panel download and read `.mfcad.json` files in the browser or Electron shell. The JSON format is documented in [Project files](project-files.md). Unsupported or malformed files stay in the current project and show an understandable import error.

Readiness responses are not FEA results. The local pre-solver run packages explicit worker inputs, computes only a demo-safe nominal screening estimate when possible, and lists FreeCAD, Gmsh, and CalculiX command availability. Missing solver binaries appear as `unavailable_review_required`; available binaries are still not invoked by this runner. The separate solver-readiness fixture can invoke CalculiX for a deterministic generated deck when `ccx` is installed, but that output is labeled as a fixture result, not project FEA. Cloud recommendations in the queue are planning-only and disabled until a provider, credentials, budget policy, and explicit approval are configured by a future slice.

The substitution selector is generated only from explicit material/process intersections in project panel data. It shows current versus substitute material, process, weight delta from density when possible, stiffness modulus, material yield, heat screening limit, cost range, lead-time range, source confidence, and review-required warnings. The `Preview backend impact` button calls the non-persisting preview endpoint and temporarily drives BOM, manufacturing, readiness, and report panels from projected backend data. The `Apply validated substitution` button is disabled until a preview succeeds; it then calls the apply endpoint and reloads persisted panel data.

The lower-level mutation endpoint is still documented for API handoff and custom local edits:

```text
POST /api/projects/{project_id}/modifications
```

The mutation payload mirrors the backend `Modification` shape: required `id`, `target_part_id`, and
`description`, plus optional `material_id`, `dimension_changes`, and `manufacturing_process`. The FastAPI
backend owns the conditional validation and mass-invalidation rules in the
[backend material substitution and modification contracts](backend.md#material-substitution-and-modification-contracts). A real backend response should attach an
advisory report until CAD, FEA, wiring, and supplier workers produce authoritative artifacts.

The bundled mock lives in `src/data/backendPanelData.json` and follows the backend handoff concepts from the local FastAPI scaffold. The Node mock API in `scripts/mock-backend.mjs` serves the same data for frontend-to-backend development. The current visual MVP seed intentionally keeps the legacy `project-open-gripper-demo` id for compatibility while presenting a robot arm with a wrist gripper.

## Connecting to a real backend later

Run or deploy the backend scaffold, then start the frontend with:

```sh
VITE_API_BASE_URL=https://your-api.example MECHAFLOW_FRONTEND_PORT=7332 npm run dev
```

Until the backend is available, or if it fails during local development, the app falls back to bundled mock panel data so frontend work is not blocked by FreeCAD or cloud compute integrations.
