# MechaFlow CAD

MechaFlow CAD is an open-source product concept for a robotics-focused CAD orchestration platform.

The goal is to help people start from free and open reference designs, inspect animated exploded views, select individual parts, modify dimensions or materials, and automatically re-check whether the design still satisfies the original task.

Example: open a robot hand or gripper design, set the task to "pick and place a 50 lb object", select a finger link, swap aluminum for a carbon-fiber nylon or steel option, and get updated payload capability, weight, cost, manufacturability, wiring, and maintenance guidance.

## What this repository contains

This repository starts as product, technical, catalog, and integration foundation documentation.

- [Product requirements](docs/product-requirements.md)
- [Technical architecture](docs/technical-architecture.md)
- [User experience](docs/user-experience.md)
- [Reference design catalog](docs/reference-design-catalog.md)
- [Open-source integration candidates](docs/open-source-integrations.md)
- [Integration adapter plan](docs/integrations/README.md)
- [Dependency license verification](docs/dependency-license-verification.md)
- [Local development](docs/local-development.md)
- [Business model](docs/business-model.md)
- [Cheap hosting plan](docs/hosting-plan.md)
- [MVP roadmap](docs/mvp-roadmap.md)
- [Data and standards strategy](docs/data-and-standards.md)

Machine-readable seeds:

- `catalog/reference-designs/reference-designs.seed.json`
- `catalog/schemas/reference-design.schema.json`
- `data/*.seed.json`

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

The process prints the selected URL. Use `python3 scripts/find_unused_port.py` when you need an explicit unused port.

Validate seed data and the working app path:

```bash
python3 scripts/validate_catalog.py
python3 tests/smoke_test.py
```

## Hosting philosophy

Keep hosting cheap by making the platform cloud-assisted rather than cloud-dependent.

- Run CAD editing, local previews, and simple checks on the user's computer when possible.
- Use cheap static hosting for the frontend.
- Use a small API server for accounts, project metadata, and job coordination.
- Use cloud compute only for heavy simulation jobs or collaboration.
- Support bring-your-own AI keys during early prototypes to control cost.

## Repository status

This repository is currently a planning and requirements repository.

No production implementation exists yet.

## License

The documentation and future source code are intended to be open source.

The initial license is MIT unless changed before implementation begins.
