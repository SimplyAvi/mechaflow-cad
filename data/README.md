# Seed Engineering Data

These JSON files provide a shared starting point for backend and frontend workers:

- `materials.seed.json`
- `tasks.seed.json`
- `manufacturing-methods.seed.json`
- `capability-ratings.seed.json`
- `standards-advisory-rules.seed.json`
- `integration-adapters.seed.json`
- `backend-frontend-handoff.seed.json`
- `captain-demo-project.mfcad.json`

Values are seed data for advisory workflows. Verify material properties, cable ratings, supplier data, and standards requirements before using them for engineering decisions.

`backend-frontend-handoff.seed.json` maps catalog reference designs, materials, tasks, manufacturing methods, capability ratings, and adapters to the names exposed by the backend project panel and frontend cockpit. It is metadata only and keeps the same license gate as the referenced catalog entry.

`captain-demo-project.mfcad.json` is a portable demo import fixture for the desktop captain flow. It includes the robot arm visual project, material substitution paths, BOM/manufacturing/wiring data, solver-readiness previews, job queue artifacts, and advisory reports. It is not FEA, a supplier quote, or electrical validation.

Validate catalog and cross-references with:

```bash
python3 scripts/validate_catalog.py
```
