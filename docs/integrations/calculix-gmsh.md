# CalculiX and Gmsh Adapter

## Purpose

Use FreeCAD, Gmsh, and CalculiX as separable workers for geometry preparation, mesh generation, and static structural checks that support advisory capability re-rating. The local pre-solver runner packages inputs without running FEA, while the solver-readiness endpoint can execute a deterministic CalculiX fixture when `ccx` is installed. The fixture verifies solver plumbing only and is not project FEA. See [Local solver execution](../local-solver-execution.md) for the executable boundary and [Backend development](../backend.md) for the API contract.

## Initial capabilities

- Create meshes for selected parts or simplified assemblies.
- Apply material data from `data/materials.seed.json`.
- Apply load cases from task definitions.
- Future worker: run static stress and displacement checks.
- Future worker: return factor of safety, limiting part, displacement, and confidence.

## Inputs

- Geometry from the FreeCAD adapter.
- Material IDs and checked numeric properties.
- Load case JSON, fixtures, contacts, and assumptions.
- Capability rating ID such as `payload-static` or `deflection-limit`.

## Outputs

- Future artifacts: mesh files.
- Current fixture artifacts: generated CalculiX input, logs, and result files.
- Future project artifacts: CalculiX input and result files generated from selected MechaFlow geometry.
- Future artifacts: images or VTK-style visualization artifacts.
- Future artifact: JSON rating report with assumptions and warnings.

## Implementation notes

- Never report results as certified or guaranteed.
- Include mesh quality, convergence status, and boundary condition assumptions.
- Fail closed when material values are unknown.
- Let cheap local workers run small jobs before cloud compute is considered.
- Replace demo estimates only after a real solver attaches result artifacts and a qualified reviewer approves them.

## Stub

See `CalculixGmshAdapter` in `src/mechaflow_cad/integrations/stub_adapters.py`.
