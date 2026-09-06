# Wiring and electronics MVP

The desktop MVP now includes a wiring and electronics pass for the robot design cockpit. It is intended to make harness impacts visible while users author the same assembly, BOM, manufacturing, import/export, and solver-readiness workflows.

## What is modeled

The backend project schema includes:

- Electronics components mounted to parts, including PCBs, sensors, service disconnects, and connector accessories.
- Connectors with pin count, part linkage, component linkage, pin labels, and basic voltage/current rating fields when known.
- Wire segments with conductor count, AWG, estimated length, endpoint references, and harness BOM item links.
- Wiring routes with endpoint connectors, route points, linked wire segments, linked electronics components, minimum clearance, bend radius, service-loop slack, and optional WireViz diagram references.
- Visual authoring metadata for locally created connector placeholders and route polylines. Browser-created routes are persisted as normal project wiring data and remain review-required until real electrical and CAD workers validate them.
- Wiring rule sets with explicit clearance, bend-radius, and service-loop thresholds.

## API surface

Use the local FastAPI backend:

```bash
uvicorn mechaflow_api.main:app --reload
```

Useful endpoints:

- `GET /api/projects/sample/wiring-electronics` returns panel-ready project wiring, electronics, BOM, route, rule, and review data.
- `GET /api/projects/sample/electronics-components` returns mounted electronics component records.
- `GET /api/projects/sample/wire-segments` returns wire segment records.
- `GET /api/projects/sample/wiring-rules` returns route screening thresholds.
- `GET /api/projects/sample/wiring-routes` returns route geometry and endpoint metadata.
- `POST /api/projects/sample/wiring-review` runs the deterministic MVP wiring review.

Project file export and import include the wiring and electronics fields because they are part of the `Project` schema. Import rejects inconsistent non-empty route lists, such as a route that references a missing wire segment.

## Review scope

The MVP review is deterministic and honest about its limits:

- `pass` means the recorded project data passes the local heuristic checks only.
- `warning` means recorded clearance, bend radius, service-loop, or similar values are below an MVP threshold.
- `review_required` means required route, connector, geometry, rule, or BOM evidence is missing.

The review does not validate exact electrical behavior. Current rating, voltage drop, EMI, flex life, moving-joint sweeps, standards compliance, and real CAD clearances remain review-required unless explicit data and workers are added later.

## Desktop demo path

Run the desktop-openable demo:

```bash
npm run desktop:open
```

In the cockpit:

1. Select a mechanical or electronics-linked part from the canvas or part tree.
2. In Design mode, choose another part in `Wire to` and click `Route visible wire` to create a cyan route polyline.
3. Open the "Wiring and electronics" panel.
4. Review the simple route diagram, route summary, connectors, linked electronics, wire segments, harness BOM additions, and evidence list.
5. Use import/export to confirm the project file carries wiring/electronics data.

WireViz remains an integration boundary. The MVP records `wireviz://` diagram references and normalized harness data, but it does not require WireViz to be installed or generate diagrams during local checks.
