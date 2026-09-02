# WireViz Adapter

## Purpose

Use WireViz to document wire harnesses, connectors, labels, lengths, BOMs, and assembly diagrams.

## Initial capabilities

- Parse WireViz YAML into normalized harness JSON.
- Generate diagrams and BOM outputs.
- Link connectors to KiCad board metadata and FreeCAD mechanical locations.
- Flag missing bend radius, service loop, strain relief, and flex-life data.

## Inputs

- WireViz YAML.
- Connector locations from KiCad and FreeCAD.
- Cable manufacturer data where available.
- Moving joint sweep information from ROS or CAD.

## Outputs

- SVG or HTML harness diagrams.
- Harness BOM CSV.
- Connector and wire route JSON.
- Warnings for bend radius and clearance assumptions.

## Implementation notes

- Do not invent manufacturer bend radius or current ratings.
- Keep route geometry separate from schematic intent.
- Route checks should cite whether they are based on manufacturer data, user input, or heuristic estimates.

## Stub

See `WireVizAdapter` in `src/mechaflow_cad/integrations/stub_adapters.py`.
