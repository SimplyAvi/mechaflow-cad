# Technical Architecture

## Architecture principle

Do not build a CAD kernel first. Use proven open-source engineering tools behind explicit orchestration contracts, and keep the MVP honest when those tools are not wired yet.

FreeCAD should remain the mechanical design foundation for future geometry import, modification, and export. Gmsh and CalculiX should remain the preferred open FEA path. KiCad, KiCadStepUp, and WireViz should remain electronics and harness integration candidates. The current code implements the product cockpit, local API contracts, seed data, project files, wiring heuristics, local-safe pre-solver packaging, and a CalculiX fixture boundary before full CAD and solver workers exist.

## Current implementation map

```text
Electron desktop shell
  |
  | starts for npm start
  v
Vite React cockpit in src/
  |                         \
  | VITE_API_BASE_URL        \ fallback mock data
  v                           \
Node mock API in scripts/       FastAPI backend in backend/mechaflow_api/
  |                              |
  | backend-shaped seed data      | in-memory project store
  | desktop and frontend smoke    | schemas, services, queues, runners
  v                              v
Project panel data, project files, material substitution,
wiring/electronics, reports, analysis readiness, job queue metadata
```

A second lightweight path exists for backend smoke coverage:

```text
src/mechaflow_cad/app.py standard-library local app
  |
  +-- catalog/data endpoints
  +-- static frontend/ integration shell
```

Use the React cockpit in `src/` for product UI work. Use `frontend/` only when the static backend smoke shell is in scope.

## Main code surfaces

### Frontend cockpit

Owner files:

- `src/App.tsx` and `src/App.css` for the application shell, visual CAD workspace shell, sidebars, mode deck, project paths, reference image intake, authoring tools, material tools, analysis, manufacturing, reports, and backend handoff UI.
- `src/VisualCadWorkspace.tsx` for the SVG XYZ grid, isometric primitives, orbit, pan, zoom, selection, dimensions, joint lines, and visible wiring polylines.
- `src/data/localPartCatalog.ts` for deterministic local robot-arm matching and catalog recipe metadata.
- `src/lib/api.ts` for backend and mock API calls.
- `src/lib/backendMapper.ts` for mapping backend panel data into cockpit state.
- `src/lib/visualAuthoring.ts` for browser-side unit conversion, primitive creation, geometry mutation, assembly metadata, visible wire-route creation, local project-file export projection, and remapping authored backend project data into React state.
- `src/lib/designIntent.ts` for local design-intent chip extraction.
- `src/data/backendPanelData.json`, `src/data/mockDesign.ts`, and `src/data/readyExamples.ts` for local fallback demo state.
- `src/*.test.tsx`, `src/lib/*.test.ts`, and `src/data/*.test.ts` for frontend behavior coverage.

Current behavior:

- Opens directly into a visual CAD authoring cockpit with compact CAD-style sidebars.
- Supports unit selection, primitive creation, selected geometry edits, motor and connector placement, parent and joint metadata, orbit, pan, zoom, explode, and visible wire routing.
- Supports a guided sketch-first part flow, local catalog matching, editable feature recipes, focus-selected inspection, and assembly placement metadata.
- Supports deterministic requirement resizing for the robot-arm demo: payload plus assembly self-weight, safety factor, reach, actuator torque, fastener, joint, sleeve, bracket, link, and end-effector checks with local upgrade catalog fixes that remain review-required.
- Supports new prompt concepts, local project import/export, recent project reopen, reference catalog path, and repository-local ready examples.
- Treats reference images as local metadata only.
- Groups advanced panels by Design, Analysis, Manufacturing, Reports, and Backend modes.
- Connects to the FastAPI backend when `VITE_API_BASE_URL` is set, otherwise falls back to bundled or Node mock data.

### Node mock and desktop shell

Owner files:

- `scripts/mock-backend.mjs` and `scripts/mock-backend-data.mjs` for the frontend-compatible local mock API.
- `scripts/dev-full.mjs`, `scripts/smoke-local.mjs`, and `tests/frontend_smoke.mjs` for local mock plus frontend smoke coverage.
- `desktop/main.cjs`, `scripts/desktop-dev.mjs`, `scripts/desktop-smoke.mjs`, `scripts/captain-demo-smoke.mjs`, and `scripts/install-macos-launcher.mjs` for the Electron desktop path.

Current behavior:

- `npm start` starts the mock API, Vite, and Electron window.
- Desktop smoke validates app identity and launch wiring without a visible manual session.
- Captain smoke imports the bundled `.mfcad.json` fixture, previews material substitution, runs local-safe analysis endpoints, confirms solver-unavailable boundaries, and exports project evidence.

### FastAPI backend

Owner files:

- `backend/mechaflow_api/models.py` for authoritative schemas.
- `backend/mechaflow_api/main.py` for endpoint wiring.
- `backend/mechaflow_api/services.py` for material substitution, modifications, panels, wiring review, reports, and readiness derivation.
- `backend/mechaflow_api/storage.py` for in-memory project persistence, import normalization, finite JSON checks, and reference validation.
- `backend/mechaflow_api/job_queue.py` for queue enrichment, cached reference normalization, and local versus cloud planning recommendations.
- `backend/mechaflow_api/runners.py` for local pre-solver job packaging.
- `backend/mechaflow_api/solver_execution.py` for local tool detection, artifact retention, and the CalculiX fixture boundary.
- `backend/mechaflow_api/adapters.py` and `backend/mechaflow_api/catalog.py` for future worker adapter metadata and seed loading.

Current behavior:

- Exposes project, catalog, material, task, panel-data, BOM, manufacturing, wiring, report, readiness, job queue, project-file, and integration metadata endpoints.
- Uses an in-memory store for local MVP state. Restarting the API clears user-created projects and jobs except seeded fixtures.
- Validates project imports through backend schemas and rejects malformed envelopes, invalid references, non-finite numbers, unsupported units, unsupported cached artifacts, and impossible download URLs.
- Keeps local pre-solver runs and solver-readiness fixtures distinct from full project FEA.
- Produces cloud recommendations only as planning estimates. It does not configure providers, credentials, billing, budgets, or remote execution.

### Seed data and contracts

Owner files:

- `catalog/reference-designs/reference-designs.seed.json` and `catalog/schemas/reference-design.schema.json` for reference design catalog records.
- `data/*.seed.json` for materials, manufacturing methods, tasks, capability seed guidance, integration adapters, ready examples, and backend/frontend handoff projections.
- `data/captain-demo-project.mfcad.json` for desktop import/export smoke evidence.
- `scripts/validate_catalog.py` and `tests/test_seed_data_validation.py` for catalog and seed validation.

Seed records are demo and planning inputs. They must preserve license status, source confidence, estimate labels, and review-required boundaries.

## Business rules encoded in the implementation

- The active engineering task remains visible while users inspect, create, route, or edit parts.
- Material substitution is two-step: preview first, then validated apply. Incompatible material/process intersections return clear errors and do not mutate the project.
- Effective material or dimension changes clear stored part mass until a CAD worker recalculates it.
- BOM, manufacturing, readiness, reports, and queue panels are derived from project state and seed manufacturing options. Cost and lead-time values are ranges, not exact quotes.
- Wiring review checks recorded route evidence against MVP thresholds. It is not exact electrical validation or CAD clearance proof.
- Pre-solver readiness packages future solver inputs and review notes. It is not FEA.
- The CalculiX fixture can execute a deterministic generated deck if `ccx` exists. It proves executable plumbing only.
- Full project FEA remains blocked until project geometry prep, meshing, solve execution, result extraction, and engineering review exist.
- Cloud execution remains disabled until provider setup, credentials, budget guardrails, and safety policy are explicit.
- Imported external designs and dependencies must pass license review before becoming product assets.

## Target worker architecture

```text
Browser or desktop UI
  |
API and orchestration server
  |
Project database and file/artifact storage
  |
Job queue
  |--------------------|----------------------|----------------------|----------------------|
FreeCAD worker        FEA worker             Electronics worker     Supplier worker
CAD import/export     Gmsh/CalculiX          KiCad/WireViz          BOM/quotes/costs
```

Future production services should use the same contracts already exercised by the MVP while replacing in-memory and seed-backed pieces with durable implementations.

## Service responsibilities

### Frontend

The frontend should provide:

- Visual-authoring-first opening path.
- Project dashboard, import/export, recent, reference, and ready-example paths.
- SVG 3D assembly viewer with XYZ grid, orbit, pan, zoom, explode, part selection, primitive creation, selected geometry editing, parent/joint metadata, and visible wire routing.
- CAD-style contextual sidebars.
- Part inspector, material and dimension editor, and active task context.
- Analysis readiness, job queue, local/cloud recommendation, manufacturing, wiring, report, and backend handoff panels.
- Plain-language labels that distinguish real outputs, heuristics, estimates, cached artifacts, and review-required gaps.

### API and orchestration server

The API should coordinate:

- Projects and future users.
- Reference design catalog and licenses.
- CAD file versions and portable project manifests.
- Background job creation, status, recommendations, and artifacts.
- Reports, BOM, manufacturing options, wiring, electronics, supplier handoff, and AI requests.

Candidate production technologies remain Python FastAPI, PostgreSQL, object storage, and a queue such as Redis/RQ, Celery, or Dramatiq. SQLite is a reasonable local persistence step before hosted PostgreSQL.

### FreeCAD worker

The CAD worker should run FreeCAD in a controlled environment. Future responsibilities:

- Import STEP, FreeCAD, STL, and other supported files.
- Parse assemblies where possible.
- Generate thumbnails, viewable geometry, and part metadata.
- Create exploded-view transforms.
- Modify parametric parts.
- Export STEP, STL, drawings, and report artifacts.

### FEA worker

The FEA worker should support:

- Geometry prep handoff from FreeCAD.
- Mesh generation and mesh-quality metadata through Gmsh.
- Boundary condition and load-case generation.
- Material assignment with provenance.
- CalculiX execution.
- Solver log and artifact capture.
- Stress, displacement, and factor-of-safety extraction.
- Capability re-rating only after solver evidence and engineering review allow it.

### Electronics worker

The electronics worker should support:

- KiCad file import.
- ECAD/MCAD model exchange.
- Wire and harness definitions.
- Wiring diagrams.
- BOM exports.
- Routing constraints and review evidence.

### Supplier worker

The supplier worker should support:

- Off-the-shelf part lookup.
- Cost estimates and exact quotes only when a provider response is present and labeled.
- Manufacturing process recommendations.
- Quote packet generation.
- Lead-time comparison.

Initial integrations should prioritize public or low-cost sources and avoid hard dependencies on paid APIs.

## Data model overview

Core entities:

- Project
- ReferenceDesign
- Assembly
- Part
- Material
- TaskRequirement
- Modification
- BOMItem
- ManufacturingOption
- ElectronicsComponent
- WireSegment
- WiringRoute
- WiringRuleSet
- WiringReview
- AnalysisReadinessPreview
- AnalysisJob
- AnalysisReport
- CachedReportReference
- CachedArtifactReference
- SupplierOption

`backend/mechaflow_api/models.py` is the authoritative current schema. Update docs after schema changes, not before.

## Job types and execution boundaries

Current and planned jobs include:

- Import design.
- Generate exploded view.
- Extract part list.
- Estimate mass properties.
- Run quick load heuristic.
- Generate pre-solver readiness.
- Run local pre-solver screening.
- Run CalculiX solver-readiness fixture.
- Run full project FEA.
- Re-rate payload capability.
- Check wire routing.
- Generate BOM.
- Generate manufacturing report.

Only local pre-solver screening, stub runs, queue enrichment, and the optional CalculiX fixture boundary are implemented today. Full project FEA and remote cloud jobs must remain unavailable until workers and policies exist.

## Local-first and cloud-assisted modes

### Local-first mode

The user's computer runs the cockpit, mock or FastAPI API, portable project files, and local-safe analysis packaging. Local services must use environment-configurable host and port settings. Use an OS-selected port for demos and tests, or choose explicit unused ports with `python scripts/find-free-port.py` or `npm run ports:find`.

Benefits:

- Lower hosting cost.
- Better privacy.
- Early prototypes can work without accounts, paid services, or cloud credentials.

Tradeoffs:

- Harder installation.
- Environment differences.
- Local tool availability varies.

### Cloud-assisted mode

The cloud may eventually host the UI, project metadata, collaboration, and optional compute workers.

Benefits:

- Easier onboarding.
- Better collaboration.
- Controlled worker environments.

Tradeoffs:

- Compute costs can rise quickly.
- CAD and simulation jobs need queue limits, budget guardrails, artifact retention, and approval flows.
- Secrets and provider credentials require vault-backed runtime configuration, never committed files.

## Security and safety

The system should:

- Sandbox uploaded CAD files and never execute untrusted project scripts by default.
- Mark analysis results as advisory unless solver evidence and engineering review validate them.
- Track source licenses for imported designs.
- Keep paid services and cloud execution behind explicit configuration and user confirmation.
- Avoid storing secrets in repositories.
- Require explicit user confirmation before purchasing or ordering parts.

## Suggested next implementation order

1. Keep root README and owner docs aligned with current code boundaries.
2. Add durable local persistence behind `backend/mechaflow_api/storage.py` without changing API behavior.
3. Add FreeCAD import metadata for one license-cleared project asset.
4. Generate real viewable geometry and exploded transforms from FreeCAD output.
5. Add Gmsh meshing for a selected part with mesh-quality evidence.
6. Run CalculiX against selected project geometry and keep fixture results separate.
7. Replace demo payload or strength estimates only when real solver artifacts and review evidence exist.
8. Harden KiCad/WireViz handoff and supplier quote packets behind clear provider boundaries.
9. Define and approve cloud execution policy before adding remote workers.
