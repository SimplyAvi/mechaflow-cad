# Technical Architecture

## Architecture principle

Do not build a CAD kernel first.

Use FreeCAD and its Python API as the mechanical design foundation, then build orchestration, user experience, job scheduling, data catalogs, and AI guidance around it.

## High-level architecture

```text
Browser UI
  |
API and orchestration server
  |
Project database and file storage
  |
Job queue
  |--------------------|----------------------|----------------------|
FreeCAD worker        FEA worker             Electronics worker     Supplier worker
CAD import/export     CalculiX/Gmsh          KiCad/WireViz          BOM/quotes/costs
```

## Main services

### Frontend

The frontend should provide:

- Project dashboard.
- Reference design browser.
- 3D assembly viewer.
- Animated exploded view.
- Part inspector.
- Material and dimension editor.
- Task definition panel.
- Analysis report panel.
- Manufacturing and cost panel.

Candidate technologies:

- React, Vue, or Svelte for app UI.
- Three.js or Babylon.js for 3D viewing.
- WebAssembly options for lightweight geometry previews when practical.

### API and orchestration server

The API should coordinate:

- Projects.
- Users.
- Reference design catalog.
- CAD file versions.
- Background jobs.
- Reports.
- Supplier and part lookup.
- AI requests.

Candidate technologies:

- Python FastAPI for engineering ecosystem fit.
- PostgreSQL for hosted production.
- SQLite for local or prototype mode.
- Redis, RQ, Celery, or Dramatiq for job queues.

### CAD worker

The CAD worker should run FreeCAD in a controlled environment.

Responsibilities:

- Import STEP, FreeCAD, STL, and other supported files.
- Parse assemblies where possible.
- Generate thumbnails and part metadata.
- Create exploded-view transforms.
- Modify parametric parts.
- Export STEP, STL, drawings, and report artifacts.

### FEA worker

The FEA worker should support:

- Mesh generation.
- Boundary condition generation.
- Load cases.
- Material assignment.
- CalculiX execution.
- Result extraction.
- Stress and displacement plots.
- Capability re-rating.

Initial stack:

- CalculiX
- Gmsh
- FreeCAD FEM workbench
- Python wrappers where useful

### Electronics worker

The electronics worker should support:

- KiCad file import.
- ECAD/MCAD model exchange.
- Wire and harness definition.
- Wiring diagrams.
- BOM exports.
- Routing constraints.

Initial stack:

- KiCad
- KiCadStepUp
- WireViz
- FreeCAD Cables workbench if compatible

### Supplier worker

The supplier worker should support:

- Off-the-shelf part lookup.
- Cost estimates.
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
- AnalysisJob
- AnalysisReport
- SupplierOption
- ManufacturingOption
- WiringRoute
- BOMItem

## Job types

Initial background jobs:

- Import design.
- Generate exploded view.
- Extract part list.
- Estimate mass properties.
- Run quick load heuristic.
- Run FEA.
- Re-rate payload capability.
- Check wire routing.
- Generate BOM.
- Generate manufacturing report.

## Local-first and cloud-assisted modes

### Local-first mode

The user's computer runs FreeCAD and simple analysis workers locally. Local services must use environment-configurable host and port settings. Use an OS-selected port for demos and tests, or choose an explicit unused port with `python3 scripts/find_unused_port.py`.

Benefits:

- Lower hosting cost.
- Better privacy.
- Uses user's CPU for heavy work.

Tradeoffs:

- Harder installation.
- Environment differences.
- Slower support burden.

### Cloud-assisted mode

The cloud hosts the UI, project metadata, and optional compute workers.

Benefits:

- Easier onboarding.
- Good collaboration.
- Controlled worker environments.

Tradeoffs:

- Compute costs can rise quickly.
- CAD and simulation jobs need queue limits.

## Security and safety

The system should:

- Sandbox uploaded CAD files.
- Avoid executing untrusted project scripts by default.
- Mark analysis results as advisory unless validated.
- Track source licenses for imported designs.
- Avoid storing secrets in repositories.
- Require explicit user confirmation before purchasing or ordering parts.

## Suggested MVP implementation order

1. Static documentation and examples.
2. Reference design catalog schema.
3. Browser 3D viewer with manual exploded transforms.
4. FreeCAD worker proof of concept.
5. Automatic part extraction.
6. Basic task definition and material substitution.
7. Simple payload re-rating heuristic.
8. FEA job for one part.
9. Report generation.
10. BOM and manufacturing option stub.
