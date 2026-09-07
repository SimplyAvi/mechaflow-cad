# MVP Roadmap

## MVP thesis

The first MVP should prove that MechaFlow CAD can make an existing robotics design understandable, editable, analyzable enough for planning, manufacturable enough for comparison, and portable enough for a desktop-openable workflow.

The MVP is successful only if it remains honest about what is implemented. Seeded guidance, heuristic checks, pre-solver packages, and solver fixtures are useful planning evidence, but they are not full CAD import, project FEA, certified electrical validation, cloud execution, or exact supplier quoting.

## Current status after PR #12

The current `main` includes:

- Root planning docs and validation policy.
- Reference design catalog schema and seed data.
- FastAPI backend with schemas, in-memory project store, project-file import/export, panel-data, material substitution, wiring/electronics, reports, analysis readiness, job queue, local pre-solver runner, and CalculiX solver-readiness fixture boundary.
- Vite React cockpit with a full-canvas visual-authoring-first opening, SVG XYZ grid, orbit/pan/zoom/explode controls, selectable and editable primitives, viewport-anchored selected-part dimensions, sketch plane/profile/extrude/cut state, fastener-aware hole placement, machinist drawing and FEA-input previews, guided sketch-first part recipes, deterministic local catalog matching, 50 lb to 75 lb requirements-driven load resizing with local upgrade suggestions, motor and connector placement, visible wire routing, contextual CAD drawers, blank part-design plane startup, new/open/recent/example/reference paths, reference-image intake, material tools, progressive modes, local project import/export, and backend/mock connectivity.
- Electron desktop-openable workflow with `npm start`, macOS command launcher, desktop smoke, and captain smoke.
- Local and GitHub Actions checks for Python, catalog, frontend, smoke, desktop, and captain paths.

## Recommended demo narrative

The captain demo should show a user who:

1. Opens the desktop cockpit directly into the robot arm visual CAD workspace.
2. Chooses units, creates or edits a primitive, and adjusts selected-part dimensions directly from the viewport beside the 3D profile.
3. Picks a sketch plane, chooses a 2D profile, sets extrude or cut state, and places a centered fastener hole 2 in from the bottom using a local screw/bolt clearance default.
4. Reviews the selected part machinist drawing/export preview and FEA-input preview with units, dimensions, material/process, load requirement, self-weight, constraints, and fastener metadata.
5. Uses the guided sleeve or coupler recipe and local catalog matching to place an authored part in the robot-arm assembly.
6. Changes the lift requirement from 50 lb to 75 lb, sees payload plus self-weight and safety-factor assumptions, highlights undersized components, and applies deterministic catalog-backed fixes without claiming certification.
7. Types design intent and sees extracted chips.
8. Adds reference images that are clearly labeled as local context only.
9. Opens or imports a `.mfcad.json` project, reopens a recent project, or loads a local ready example.
10. Explodes, orbits, pans, zooms, and selects parts in the assembly.
11. Previews a compatible material/process substitution.
12. Applies the validated substitution and sees downstream panels update.
13. Reviews BOM, manufacturing, wiring/electronics, analysis readiness, queue recommendations, reports, and project file export/import.
14. Runs local-safe pre-solver and solver-readiness fixture paths while seeing not-FEA and solver-unavailable labels where appropriate.

## Milestone status

### Milestone 1: documentation and repository setup

Status: complete, with ongoing alignment required.

Deliverables:

- Root README as canonical onboarding map.
- Product requirements.
- Technical architecture.
- UX documentation.
- Open-source integration list.
- Hosting plan.
- Business model.
- Validation policy.

Acceptance criteria:

- Future workers can find product thesis, business rules, implementation surfaces, current boundaries, and validation commands from the README.
- Docs do not invent capabilities beyond code.

### Milestone 2: reference design catalog schema

Status: complete for seed metadata.

Deliverables:

- JSON schema for open reference designs.
- Example catalog entries.
- License field.
- File format field.
- BOM field.
- Source URL field.
- Review status.

Acceptance criteria:

- Catalog changes pass `python scripts/validate_catalog.py`.
- External assets remain links and metadata until license-cleared import work exists.

### Milestone 3: static visual prototype

Status: complete and superseded by the interactive cockpit.

Deliverables:

- Browser page showing a sample robot hand or arm.
- Mock animated exploded view.
- Clickable part callouts.
- Part inspector panel.
- Material option cards.
- Capability or readiness output that is clearly labeled as seed, heuristic, or review-required.

Acceptance criteria:

- Visual and copy avoid fake payload, FEA, quote, electrical, or CAD-generation claims.

### Milestone 4: visual CAD authoring cockpit

Status: complete for the local seed MVP.

Deliverables:

- Visual-authoring-first opening with immediate XYZ grid workspace.
- Robot arm and wrist gripper visual seed.
- Explode toggle, scrubber, yaw, pitch, pan, zoom, part selection, and inspector.
- Primitive palette for base plates, beams, joints, brackets, motors, connectors, electronics, and tools.
- Unit selector and editable dimensions, XYZ position, rotation, material, process, parent, and joint type.
- Visible wire routing between parts with persisted route, connector, wire segment, and harness BOM data.
- CAD-style sidebars and progressive mode deck.
- New prompt concept, open/import, recent, ready example, and reference paths.
- Reference image intake as local metadata.

Acceptance criteria:

- `npm test`, `npm run build`, `npm run smoke`, `npm run desktop:smoke`, and `npm run captain:smoke` cover the automated path.
- Manual desktop review follows [Desktop demo](desktop.md).

### Milestone 5: backend orchestration scaffold

Status: complete for local MVP contracts.

Deliverables:

- FastAPI API with project, catalog, schemas, task, panel-data, BOM, manufacturing, wiring/electronics, reports, readiness, job queue, project files, and local-analysis endpoints.
- In-memory store with explicit future persistence seam.
- Seed loading and backend/frontend handoff contracts.
- Validation tests for endpoints, schemas, services, storage, catalog, and smoke path.

Acceptance criteria:

- `pytest`, `python scripts/validate_catalog.py`, unit seed validation, and `PYTHONPATH=src python3 tests/smoke_test.py` pass.
- Restart-clears-local-state behavior is documented.

### Milestone 6: task-preserving material substitution

Status: complete for compatible seed-backed options.

Deliverables:

- Active task context remains visible.
- Selected part material/process options derive from explicit compatibility intersections.
- Preview endpoint returns projected panel data without persisting.
- Apply endpoint validates and persists.
- Frontend comparison cards show weight, stiffness, yield, heat, cost range, lead-time range, warnings, and review labels.

Acceptance criteria:

- Incompatible or invalid substitutions fail clearly.
- Persisted changes update project, BOM, manufacturing, readiness, and reports.
- Mass, payload, and solver labels remain review-required when no worker artifact exists.

### Milestone 7: portable desktop project files

Status: complete for MVP JSON project envelopes.

Deliverables:

- `.mfcad.json` export.
- `.mfcad.json` import or reopen.
- Backend schema validation.
- Frontend and desktop controls.
- Captain fixture at `data/captain-demo-project.mfcad.json`.

Acceptance criteria:

- Project files preserve units, authored geometry metadata, assemblies, parts, materials, task requirements, modifications, analysis jobs, job recommendations, cached references, reports, wiring/electronics, and analysis artifacts.
- Invalid envelopes fail without erasing current state.

### Milestone 8: wiring and electronics pass

Status: complete for deterministic MVP heuristics.

Deliverables:

- Electronics components, connectors, wire segments, wiring routes, and wiring rule sets.
- Harness BOM links.
- Wiring/electronics panel.
- Deterministic route review endpoint.
- Import/export validation for wiring references.

Acceptance criteria:

- Route evidence returns pass, warning, or review-required.
- Copy states that exact electrical validation, EMI, voltage drop, flex life, moving-joint sweeps, standards compliance, and real CAD clearance checks remain future work.

### Milestone 9: local pre-solver and solver-readiness boundary

Status: complete for safe local MVP boundary.

Deliverables:

- Selected-part and assembly pre-solver readiness previews.
- Local tool detection for FreeCAD, Gmsh, and CalculiX.
- Local pre-solver screening run that persists a not-FEA artifact.
- CalculiX fixture deck generation and optional `ccx` execution.
- Artifact retention and project-file metadata handling.
- Queue recommendations that distinguish local-ready, solver-unavailable, review-required, and cloud-planning-only states.

Acceptance criteria:

- Missing solvers produce understandable unavailable states.
- Fixture results are labeled fixture only.
- Full project FEA stays review-required until FreeCAD geometry prep, Gmsh meshing, and CalculiX project solving exist.

### Milestone 10: manufacturing and quote packet planning

Status: partial.

Complete today:

- BOM and manufacturing option panels.
- Seeded process options.
- Cost and lead-time ranges.
- Material substitution impact on manufacturing and BOM summaries.

Still future:

- Supplier-neutral quote packet export with attached drawings or CAD artifacts.
- Provider-specific quote API integration.
- Exact supplier pricing or purchase workflow.

Acceptance criteria for future completion:

- Exact quote claims appear only after a provider response is present and labeled.
- Purchase or order actions require explicit user confirmation.

### Milestone 11: real FreeCAD import and geometry handoff

Status: future.

Deliverables:

- Import one license-cleared STEP or FreeCAD assembly.
- Extract part metadata where possible.
- Generate viewable geometry.
- Generate real exploded transforms.
- Preserve source, license, and CAD provenance.

Acceptance criteria:

- No third-party asset is imported without license review.
- Geometry mapping survives project file export/import or has clear artifact references.

### Milestone 12: first project FEA-backed report

Status: future.

Deliverables:

- Prepare one selected part or assembly from project geometry.
- Generate a Gmsh mesh.
- Run CalculiX against project geometry.
- Capture solver logs and artifacts.
- Extract stress, displacement, and factor-of-safety values.
- Generate a plain-language report with engineering-review status.

Acceptance criteria:

- Solver evidence is tied to selected project geometry, not the fixture deck.
- Reports clearly separate solver output, assumptions, mesh quality, and review status.
- Payload or capability re-rating is not shown as real until the evidence supports it.

### Milestone 13: cloud-assisted jobs

Status: planning-only.

Complete today:

- Deterministic local versus cloud recommendation metadata.
- Planning estimates for runtime, wait, and cost when cloud would be useful.
- Disabled `cloud_execution_available` state.

Still future:

- Provider selection.
- Credentials through vault-backed runtime config.
- Budget guardrails.
- Remote worker sandboxing.
- Artifact transfer and retention.
- User approval flows.

Acceptance criteria for future completion:

- Cloud execution cannot run without explicit provider, credentials, budget, safety, and user-confirmation policy.
- No secrets are committed.

## Recommended immediate next tasks

1. Keep README and planning docs synchronized as implementation changes land.
2. Add durable local persistence behind the existing project repository boundary.
3. Add a license-cleared FreeCAD import proof for one design asset.
4. Replace seed geometry with generated viewable geometry and real exploded transforms.
5. Implement project Gmsh and CalculiX flow only after the geometry handoff is validated.
6. Define and explicitly approve future cloud execution policy before adding remote workers.
