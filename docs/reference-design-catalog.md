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
4. Link every task, material, manufacturing method, and capability rating to seed data IDs where possible.

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

The validator checks JSON syntax, IDs, top-level and nested required fields, field types, license caution visibility, and references from designs to seed materials, manufacturing methods, and capability ratings.

## Adding a new reference design

1. Find the upstream repository or project page.
2. Run the dependency license checklist in `docs/dependency-license-verification.md`.
3. Pin the exact commit, release, or page snapshot reviewed.
4. Add one catalog entry with source URLs, declared license, evidence, cautions, asset format hints, and import notes.
5. Leave `review.status` as `needs-license-review` unless the exact assets to import have been checked.
6. Run `python3 scripts/validate_catalog.py`.

## Seed catalog scope

The seed catalog includes only metadata and source links. It does not vendor any third-party design files. This keeps hosting cheap, avoids redistribution mistakes, and lets workers fetch or clone only user-approved, license-cleared assets.
