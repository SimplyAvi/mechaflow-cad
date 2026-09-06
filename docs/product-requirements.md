# Product Requirements

## Product name

MechaFlow CAD

## Mission

Make robotics and automation design more accessible by connecting open mechanical designs, task-preserving CAD edits, engineering analysis readiness, electronics planning, manufacturing logistics, and AI-guided decision support in one workflow.

## Product thesis

The product is an engineering cockpit, not a CAD kernel replacement. It should help users understand an existing robotics design, make scoped changes, and see downstream consequences before they invest in full CAD, solver, supplier, or standards work.

The business logic is:

- Reduce the time between a design idea and a reviewable engineering package.
- Start from open reference designs and local project files whenever possible.
- Keep core workflows local-first to control cost and protect user data.
- Add cloud compute, supplier APIs, collaboration, AI services, and licensed standards as optional configured layers, not required MVP dependencies.
- Keep evidence provenance visible so users can tell seed estimates, heuristics, pre-solver packages, real solver outputs, and engineering review apart.

## Target users

Initial users:

- Robotics builders who want to modify existing designs safely.
- Engineers who want a faster concept-to-analysis workflow.
- Makers who want open designs with guided manufacturing options.
- Students learning mechanical design, electronics, and simulation.

Later users:

- Small manufacturers.
- Automation integrators.
- Enterprise engineering teams.
- Research labs.

## Primary user story

A user opens MechaFlow CAD and lands in a 3D-first cockpit. They can type a design intent, add reference images as local context, open or import a project file, reopen a recent project, browse ready examples, or inspect a reference design.

Inside the cockpit, the user selects a part, sees what it does, sees material and manufacturing options, previews a compatible part/material/process change, and checks how the change affects active task context, BOM, cost range, lead-time range, wiring, analysis readiness, queued jobs, and reports.

The MVP must keep the original task visible and must label unsupported outputs as review-required. For example, if the task is lifting 50 lb, current code may preserve that task and package pre-solver evidence, but it must not claim a real payload rating unless a future solver and engineering review produce one.

## Required capabilities

### Opening and project paths

The opening experience should support:

- Immediate 3D workspace with compact contextual sidebars.
- One design-intent command line with extracted prompt chips where possible.
- Reference image upload or drag/drop as local metadata only.
- New prompt concept path with proxy rendering, not generated CAD.
- Open or import `.mfcad.json` project files.
- Recent project reopen.
- Repository-local ready examples.
- Reference design catalog path with license and source review metadata.

### Open reference design catalog

The platform should maintain a catalog of open reference designs.

Each entry should include:

- Name.
- Source URL.
- License.
- Supported file formats.
- CAD files.
- Assembly files.
- Drawings when available.
- BOM when available.
- Electronics files when available.
- Manufacturing notes when available.
- Known limitations.
- Review status, including license review state.

No external design asset should become a product asset until the exact asset and license have been reviewed.

### Animated exploded views and 3D inspection

The platform should create exploded views for assemblies.

The exploded view should:

- Separate parts and subassemblies visually.
- Animate or scrub the separation.
- Keep labels or inspectors attached to selected parts.
- Allow selecting any part.
- Allow drilling into subassemblies.
- Show part purpose, material, cost range, weight estimate or review-required mass, related fasteners, and related wiring when known.

The current MVP uses a repository-local visual seed for the robot arm and wrist gripper. Future FreeCAD work should replace manual seed geometry with imported or generated viewable geometry only after license and CAD pipeline checks pass.

### Task-preserving design edits

The platform should preserve the design task during editing.

Example tasks:

- Lift 50 lb.
- Reach 1 meter.
- Complete a pick-and-place cycle in 2 seconds.
- Fit inside a given envelope.
- Survive a target number of cycles.
- Avoid full disassembly during maintenance.
- Route wires through a moving joint with serviceability constraints.

When a part changes, the system should re-check available evidence against the task instead of treating the edit as isolated geometry.

### Material and manufacturing substitution

The platform should let users compare compatible material and process options.

MVP rules:

- The substitution list is generated from explicit intersections between the selected part's supported manufacturing options and material compatible processes.
- Preview must be available before apply.
- Preview must not persist project mutation.
- Apply must run the same validation and then update the project.
- Incompatible requests, unknown ids, blank ids, and missing process compatibility must return clear errors and leave the project unchanged.
- Effective material or dimension changes must clear stored part mass until a CAD worker recalculates it.
- Cost and lead-time values are ranged seed estimates unless a real supplier response exists.

### Capability re-rating

The long-term product should rate the modified design against the task when real analysis evidence allows it.

Example future outputs:

- Solver-backed result indicates the design remains within reviewed load limits.
- Review finds the selected material is likely insufficient for the target load.
- Strength improves, but actuator torque, heat, or wiring becomes the limiting risk.

MVP boundary:

- The current app may show seeded criteria, heuristic screening, and pre-solver readiness.
- It must keep payload capability, safety factor, stress, displacement, and failure visualization under review unless real project solver artifacts exist.
- Reports must state whether evidence is seeded, heuristic, pre-solver, fixture-only, unavailable, or review-required.

### Standards-aware design suggestions

The platform should suggest standard holes, fasteners, fits, clearances, edge distances, and tolerances where data is available.

The system must distinguish:

- Open advisory rules.
- Manufacturer-specific recommendations.
- Licensed authoritative standards.
- User-configured company standards.

The MVP must not redistribute licensed standards content without documented rights.

### Finite element analysis

The platform should support background FEA checks for selected parts and assemblies in a future solver-backed slice.

Long-term FEA should cover:

- Static structural analysis.
- Cantilever-style loads.
- Stress concentration around holes.
- Material comparison.
- Factor of safety.
- Displacement.
- Failure point visualization.

Current MVP boundary:

- Analysis readiness packages load cases, constraints, material provenance, thermal guidance, solver placeholders, and expected FreeCAD, Gmsh, and CalculiX artifacts.
- Local pre-solver runs persist review-required packages and may include nominal demo screening when enough seed inputs exist.
- The CalculiX fixture generates a tiny deterministic deck and invokes `ccx` only when installed. It is not project FEA.
- Full project FEA requires future FreeCAD geometry prep, Gmsh meshing, CalculiX project solving, result extraction, and engineering review.

### Electronics and wiring

The platform should support electronics-aware mechanical design.

Required workflows:

- Import or link KiCad PCB designs in future worker slices.
- Route wires or harness paths through assemblies.
- Check recorded clearance and bend-radius constraints.
- Suggest service loops and strain relief.
- Generate wiring diagrams and harness BOMs.

Current MVP boundary:

- Backend schemas and seed data model electronics components, connectors, wire segments, wiring routes, rule sets, route review evidence, and harness BOM linkages.
- The wiring review returns `pass`, `warning`, or `review_required` using deterministic heuristics.
- Exact electrical behavior, EMI, voltage drop, current-rating validation, flex life, moving-joint sweeps, real CAD clearances, and standards compliance remain review-required.

### Manufacturing and logistics

The platform should suggest how to make or buy each part.

Options should include:

- Off-the-shelf part sourcing.
- 3D printing.
- CNC machining.
- Sheet metal.
- PCB fabrication.
- Wire harness production.

Each option should include cost range, lead time when available, supplier links, and risk notes. Exact quotes or purchase actions require a real provider response and explicit user confirmation.

### Maintainability

The platform should flag difficult-to-service designs.

It should suggest:

- Modular subassemblies.
- Access panels.
- Standard fasteners.
- Replaceable wear parts.
- Avoiding buried components that fail often.

## Current MVP deliverables

The current repository provides:

- Root README and planning docs as the onboarding map.
- FastAPI backend contracts and in-memory local store.
- React cockpit with input-first 3D workspace and contextual mode surfaces.
- Node mock API and Electron desktop path.
- Seed reference, project, materials, manufacturing, wiring, integration, and ready-example data.
- Portable `.mfcad.json` project file import/export.
- Local pre-solver runner and CalculiX solver-readiness fixture boundary.
- Wiring/electronics heuristic review.
- Local and CI validation commands documented in [Validation policy](validation.md).

## Non-goals for the first MVP

- Replacing professional CAD systems completely.
- Certifying safety-critical designs.
- Providing licensed engineering standards for free.
- Full high-fidelity dynamic robot simulation.
- Fully automatic manufacturing order placement.
- Photo-to-3D reconstruction.
- Prompt-to-CAD geometry generation.
- Full project FEA.
- Cloud compute execution without provider, credentials, budgets, and explicit approval.
- Exact supplier quotes without a provider response.
- Exact electrical validation without explicit data and workers.

## MVP acceptance criteria

The MVP succeeds if a user can:

1. Open the desktop or browser cockpit and start in the 3D workspace.
2. Type design intent and add reference images without false CAD-generation claims.
3. Open, import, reopen, or load a local ready-example project.
4. View and manipulate an exploded robot assembly concept.
5. Select a part and inspect task, material, manufacturing, wiring, and review labels.
6. Preview and apply a compatible material/process substitution through validated contracts.
7. See BOM, manufacturing, wiring, analysis readiness, job queue, and report panels update with honest estimate and review-required labels.
8. Run local-safe pre-solver and solver-readiness fixture paths without claiming project FEA.
9. Export and import a `.mfcad.json` file that preserves the meaningful MVP state.
10. Pass the local and CI validation policy for changed surfaces.

## Future acceptance criteria for real analysis

A future task may only claim real project FEA or real re-rating after it can demonstrate:

- License-cleared project geometry input.
- FreeCAD geometry prep with named analysis regions or equivalent mapping.
- Gmsh mesh generation and mesh-quality evidence.
- CalculiX execution against the selected project part or assembly.
- Captured solver logs and result artifacts.
- Result extraction for stress, displacement, and factor of safety.
- Clear engineering-review status and limitations.
- Import/export and report provenance that preserve the real solver artifact references.
