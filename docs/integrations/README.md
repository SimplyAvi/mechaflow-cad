# Integration Adapter Plan

MechaFlow CAD should orchestrate mature open-source engineering tools instead of rebuilding them. Adapter contracts are seeded in `src/mechaflow_cad/integrations/`, machine-readable adapter metadata lives in `data/integration-adapters.seed.json`, and the implementation plan is split by integration below.

- [FreeCAD](freecad.md)
- [CalculiX and Gmsh](calculix-gmsh.md)
- [KiCad and KiCadStepUp](kicad-stepup.md)
- [WireViz](wireviz.md)
- [ROS and URDF](ros-urdf.md)
- [Manufacturing quote packets](manufacturing-quote-packets.md)
- [Materials and standards data](materials-standards-data.md)

## Adapter rules

1. Do not make optional engineering tools required hosted dependencies until license and deployment review are complete.
2. Probe local tool availability before running jobs.
3. Use project workspaces with pinned input files and generated artifacts.
4. Return warnings and confidence levels with every result.
5. Keep paid APIs optional and replaceable. The seed foundation requires no paid runtime dependency.

## Shared request shape

Each adapter should accept a small JSON request stored in a project workspace. Common fields:

```json
{
  "request_id": "example-job-001",
  "project_id": "local-demo",
  "reference_design_id": "gaiahand",
  "inputs": [],
  "outputs": [],
  "assumptions": {},
  "license_review": {
    "source_checked": true,
    "asset_import_allowed": false,
    "notes": []
  }
}
```

The stubs intentionally return `confidence: "stub"` until real adapters are implemented. Keep adapter IDs stable across the docs, `data/integration-adapters.seed.json`, `data/backend-frontend-handoff.seed.json`, and `src/mechaflow_cad/integrations/registry.py`.
