# CalculiX and Gmsh Adapter

## Purpose

Use Gmsh for mesh generation and CalculiX for static structural checks that support advisory capability re-rating.

## Initial capabilities

- Create meshes for selected parts or simplified assemblies.
- Apply material data from `data/materials.seed.json`.
- Apply load cases from task definitions.
- Run static stress and displacement checks.
- Return factor of safety, limiting part, displacement, and confidence.

## Inputs

- Geometry from the FreeCAD adapter.
- Material IDs and checked numeric properties.
- Load case JSON, fixtures, contacts, and assumptions.
- Capability rating ID such as `payload-static` or `deflection-limit`.

## Outputs

- Mesh files.
- CalculiX input and result files.
- Images or VTK-style visualization artifacts.
- JSON rating report with assumptions and warnings.

## Implementation notes

- Never report results as certified or guaranteed.
- Include mesh quality, convergence status, and boundary condition assumptions.
- Fail closed when material values are unknown.
- Let cheap local workers run small jobs before cloud compute is considered.

## Stub

See `CalculixGmshAdapter` in `src/mechaflow_cad/integrations/stub_adapters.py`.
