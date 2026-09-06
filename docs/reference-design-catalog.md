# Reference Design Catalog

MechaFlow CAD starts from open reference designs instead of blank CAD canvases.
The machine-readable seed catalog lives in:

- Schema: `catalog/schemas/reference-design.schema.json`
- Seed entries: `catalog/reference-designs/reference-designs.seed.json`
- Shared engineering data: `data/*.seed.json`

## Design principles

1. Reference upstream designs by URL first. Do not copy CAD, PCB, BOM, or documentation assets until license review is complete.
2. Record license evidence and uncertainty directly in each entry.
3. Keep mechanical, electronics, BOM, manufacturing, ROS, and analysis notes together so import work can proceed without rewriting the catalog.
4. Link tasks, materials, manufacturing methods, and capability ratings to seed data IDs. `engineering_intent.example_task_ids` references `data/tasks.seed.json`, so example tasks stay machine-readable instead of free text.
5. Use `handoff` metadata to connect a design to backend job types, frontend panels, and adapter IDs without importing upstream assets.

## License compatibility values

- `appears-compatible`: current public metadata appears compatible with open use, but per-file review is still required before import.
- `conditional`: terms appear open but impose obligations, such as reciprocal hardware source sharing.
- `uncertain`: public metadata is incomplete, conflicting, or does not clearly cover every asset type.
- `not-compatible`: known terms do not meet MechaFlow CAD open use goals. Do not import unless the requirement changes.

A design with `conditional`, `uncertain`, or `not-compatible` compatibility must not be marked `ready-for-import`.

## Validation

Run:

```bash
python3 scripts/validate_catalog.py
```

The validator checks each entry against `catalog/schemas/reference-design.schema.json` itself, so required
fields, field types, enums, patterns, and unknown fields all come from the schema rather than a second copy of
it. On top of the schema it checks unique IDs, license caution visibility, integration adapter references,
backend job type names, and references from designs to seed tasks, materials, manufacturing methods, and
capability ratings. For every handoff job, one declared adapter capability must support the job type and
artifact kind together, and the artifact must match the canonical kind for that job type.

## Adding a new reference design

1. Find the upstream repository or project page.
2. Run the dependency license checklist in `docs/dependency-license-verification.md`.
3. Pin the exact commit, release, or page snapshot reviewed.
4. Add one catalog entry with source URLs, declared license, evidence, cautions, asset format hints, import notes, and required `handoff` metadata.
5. Leave `review.status` as `needs-license-review` unless the exact assets to import have been checked.
6. Add adapter IDs only if they exist in `data/integration-adapters.seed.json`.
7. Run `python3 scripts/validate_catalog.py`.

## Seed catalog scope

The seed catalog includes only metadata and source links. It does not vendor any third-party design files. This keeps hosting cheap, avoids redistribution mistakes, and lets workers fetch or clone only user-approved, license-cleared assets.

## Ready-example follow-up candidates

The input-first opening flow currently uses only repository-local MIT seed data in `data/ready-examples.seed.json`; no internet-sourced CAD, mesh, or photo asset is included. Future external ready examples should go through the license checklist before any asset import. Candidate upstreams found during this slice:

- BCN3D Moveo: https://github.com/BCN3D/BCN3D-Moveo. The repository exposes CAD files, STL files, BOM, firmware, and a license file. It still needs per-file CAD license confirmation and attribution review before import.
- Thor robot arm: https://github.com/AngelLM/Thor. The repository exposes FreeCAD, STEP, and STL folders and states CC BY-SA 4.0 licensing in the README. Its reciprocal attribution and share-alike requirements need product review before import.
- Robonine SO-ARM100/101 parallel gripper: https://github.com/roboninecom/3D-Printed-Parallel-Gripper-for-Robotics-Arms. The repository exposes STEP and STL model files and separates hardware, software, and documentation licenses. Its CERN-OHL-P-2.0 hardware terms need review before import.
