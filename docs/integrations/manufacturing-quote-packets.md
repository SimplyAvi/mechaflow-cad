# Manufacturing Quote Packet Adapter

## Purpose

Generate supplier-neutral manufacturing packets without requiring paid quote APIs. Users can send packets to shops or upload them to optional vendor portals outside the required runtime path.

## Initial capabilities

- Package CAD exports, drawings, BOM rows, material choices, process choices, and assumptions.
- Support 3D printing, CNC milling, sheet metal, PCB fabrication, wire harness production, and off-the-shelf sourcing.
- Produce a JSON manifest and human-readable checklist.

## Inputs

- Manufacturing method ID from `data/manufacturing-methods.seed.json`.
- Part geometry and drawings.
- Material ID and source confidence.
- Quantity, finish, tolerances, and required date.
- License review status for all packet assets.

## Outputs

- Quote packet directory.
- Supplier-neutral JSON manifest.
- Missing information checklist.
- Cost and lead-time placeholders with confidence labels.

## Implementation notes

- Do not place orders automatically.
- Keep paid supplier APIs optional and replaceable.
- Include license and attribution files when redistributed design assets require them.
- Warn when a packet includes reciprocal hardware design sources.

## Stub

See `ManufacturingPacketAdapter` in `src/mechaflow_cad/integrations/stub_adapters.py`.
