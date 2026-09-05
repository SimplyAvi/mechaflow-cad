# Open-Source Integration Candidates

## Policy

The platform should prefer open-source systems and public file formats.

Before implementation, each dependency must pass the checklist in [Dependency license verification](dependency-license-verification.md) and be reviewed for:

- License compatibility.
- Maintenance status.
- Operating system support.
- API stability.
- Installation complexity.
- Commercial-use permission.
- Cost to host or operate.

This file lists candidates, not final legal approval. Required runtime dependencies must not be closed-source or paid-only. Paid services can be optional integrations only when an open or local path remains available.

Adapter implementation notes live in [docs/integrations](integrations/README.md).

## Mechanical CAD

### FreeCAD

Repository: https://github.com/FreeCAD/FreeCAD

Use:

- Parametric CAD foundation.
- Python automation.
- Assembly and part manipulation.
- FEM integration.
- Export and import workflows.

Why:

- Mature open-source CAD platform.
- Good extension ecosystem.
- Avoids building a CAD kernel from scratch.

### OpenCascade

FreeCAD uses OpenCascade as its geometry kernel.

Use:

- Solid geometry operations through FreeCAD.

## Standard parts and fasteners

### FreeCAD Fasteners Workbench

Repository: https://github.com/shaise/FreeCAD_FastenersWB

Use:

- Standard screws, nuts, washers, and fastener insertion.

### BOLTS / boltsparts

Repository: https://github.com/boltsparts/boltsparts

Use:

- Open mechanical parts database.

### OpenMechanical

Repository: https://github.com/pu2smj/OpenMechanical

Use:

- Parametric mechanical components.

### step.parts

Repository: https://github.com/earthtojake/step.parts

Use:

- Open STEP parts library.

## FEA and meshing

Current MVP status: the app records pre-solver load cases, constraints, material provenance, thermal guidance, and expected artifacts, and can package a review-required demo screening artifact. It does not run a solver. Demo estimates must be replaced by real solver and review artifacts before engineering use. See [Backend development](backend.md) for the runner contract and invocation.

### FreeCAD FEM preparation

Use:

- Defeatured analysis geometry.
- Named faces for loads, constraints, contacts, and fixtures.
- Material assignment and unit normalization before meshing.

### Gmsh

Repository: https://github.com/sasobadovinac/gmsh or official upstream mirrors where applicable.

Use:

- Mesh generation.
- Mesh-quality and convergence metadata.

### CalculiX

Use:

- Static structural finite element analysis.
- Solver decks, result files, stress and displacement extraction, and review reports.

Notes:

- FreeCAD FEM supports CalculiX workflows.
- The current adapter contract keeps Gmsh meshing separable from CalculiX solving so future workers can replace either stage.

### Python CalculiX tools

Candidates:

- https://github.com/calculix/pygccx
- https://github.com/drlukeparry/pyccx

Use:

- Programmatic FEA job setup and parsing where useful.

## Electronics and wiring

### KiCad

Repository: https://github.com/KiCad/kicad-source-mirror

Use:

- PCB design and electronics files.

### KiCadStepUp

Repository: https://github.com/easyw/kicadStepUpMod

Use:

- ECAD and MCAD exchange between KiCad and FreeCAD.

### fcad_pcb

Repository: https://github.com/realthunder/fcad_pcb

Use:

- FreeCAD and KiCad PCB integration workflows.

### WireViz

Repository: https://github.com/wireviz/WireViz

Use:

- Wire harness documentation and BOM output.

### FreeCAD Cables workbench

Repository: https://github.com/sargo-devel/Cables

Use:

- Parametric cable routing inside FreeCAD.

## Robotics

### ROS 2

Use:

- Robot descriptions, motion simulation, and integration with robot tooling.

### freecad.cross

Repository: https://github.com/galou/freecad.cross

Use:

- FreeCAD and ROS integration.
- URDF/Xacro import/export.
- Kinematics workflows.

### freecad.robotcad

Repository: https://github.com/drfenixion/freecad.robotcad

Use:

- ROS 2 robot description workflows.

## Manufacturing and costing

### PartCAD

Repository: https://github.com/partcad/partcad

Use:

- Hardware project and part management workflows.

### AgentRFQ / rfq-spec

Repository: https://github.com/FuturePresentLabs/rfq-spec

Use:

- Structured manufacturing quote request format.

### 3D Printing Quote Engine

Repository: https://github.com/Machine-Shop-Suite/3D-Printing-Quote-Engine

Use:

- Open-source 3D print cost estimation.

## Required due diligence before coding

For every dependency:

1. Verify the exact license using [Dependency license verification](dependency-license-verification.md).
2. Confirm commercial use is allowed.
3. Confirm the dependency is actively maintained or acceptable to vendor/fork.
4. Confirm it can run locally or cheaply in a worker.
5. Confirm the install process is automatable.
6. Document any non-open-source or paid dependency.
7. Keep the dependency optional if license or runtime cost is unclear.

## Standards caution

Many industry standards are copyrighted and not freely redistributable.

The platform should start with open advisory rules and public manufacturer recommendations.

Authoritative standards support should be added through licensed standards packs or user-provided company rule packs.
