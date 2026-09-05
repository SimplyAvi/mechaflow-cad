# KiCad and KiCadStepUp Adapter

## Purpose

Connect electronics design to mechanical design so boards, connectors, keep-outs, and harness endpoints are visible during CAD edits.

## Initial capabilities

- Read KiCad PCB files after license review.
- Export or import STEP board geometry through KiCadStepUp and FreeCAD.
- Extract board outline, mounting holes, keep-outs, and connector metadata.
- Provide electronics-aware constraints to the part inspector and report panel.

## Inputs

- KiCad project files.
- Board STEP exports.
- Connector and component metadata.
- FreeCAD assembly context.

## Outputs

- Board geometry for MCAD placement.
- Connector table for WireViz.
- Clearance and keep-out JSON.
- Electronics BOM references.

## Implementation notes

- Treat manufacturer component models and datasheets as separate licensed assets.
- Keep KiCad and KiCadStepUp optional local tools until packaging decisions are reviewed.
- Prefer file-based exchange over paid cloud ECAD APIs.

## Stub

See `KiCadStepUpAdapter` in `src/mechaflow_cad/integrations/stub_adapters.py`.
