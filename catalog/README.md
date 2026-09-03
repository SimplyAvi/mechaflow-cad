# Catalog

This directory contains machine-readable catalog seeds for open reference designs.

- `schemas/reference-design.schema.json` documents the `reference-design.v1` entry shape.
- `reference-designs/reference-designs.seed.json` contains starter metadata for open robotics design candidates plus required backend/frontend handoff metadata.

Do not copy third-party CAD, PCB, BOM, image, or documentation assets into this repository until license review is complete. Store upstream URLs, review status, cautions, and pinned revisions first.

Validate with:

```bash
python3 scripts/validate_catalog.py
```
