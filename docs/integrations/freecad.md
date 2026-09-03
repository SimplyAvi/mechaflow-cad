# FreeCAD Adapter

## Purpose

Use FreeCAD as the mechanical CAD automation foundation for imports, exploded views, part selection, material substitutions, and export workflows.

## Initial capabilities

- Import STEP, STL, OBJ, and FreeCAD `FCStd` files.
- Parse part and assembly structure where source data supports it.
- Generate thumbnails, part metadata, and selectable part IDs.
- Seed exploded-view transforms from assembly trees or manual hints.
- Apply simple material metadata changes and export modified artifacts.

## Inputs

- License-cleared reference design files.
- Catalog entry ID and pinned upstream commit.
- Optional manual assembly map when upstream CAD lacks structure.
- Material IDs from `data/materials.seed.json`.

## Outputs

- Part tree JSON.
- Exploded transform JSON.
- glTF or other viewer-ready geometry.
- STEP, STL, drawing, and report artifacts when requested.

## Implementation notes

- Run FreeCAD in a local worker or explicitly provisioned container.
- Disable execution of untrusted project macros by default.
- Keep source file paths and license review records in output metadata.
- Treat viewer geometry as derived from the reviewed source license.

## Stub

See `FreeCADAdapter` in `src/mechaflow_cad/integrations/stub_adapters.py`.
