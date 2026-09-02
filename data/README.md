# Seed Engineering Data

These JSON files provide a shared starting point for backend and frontend workers:

- `materials.seed.json`
- `tasks.seed.json`
- `manufacturing-methods.seed.json`
- `capability-ratings.seed.json`
- `standards-advisory-rules.seed.json`

Values are seed data for advisory workflows. Verify material properties, cable ratings, supplier data, and standards requirements before using them for engineering decisions.

Validate catalog and cross-references with:

```bash
python3 scripts/validate_catalog.py
```
