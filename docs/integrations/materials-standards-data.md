# Materials and Standards Data Adapter

## Purpose

Normalize materials, manufacturer data, advisory rules, licensed standards references, and company rule packs for analysis and reporting.

## Initial capabilities

- Load seed material JSON from `data/materials.seed.json`.
- Load advisory rules from `data/standards-advisory-rules.seed.json`.
- Attach source URLs, retrieval dates, and confidence labels.
- Keep licensed authoritative standards separate from open advisory rules.

## Data classes

- Open advisory rules.
- Manufacturer data with source URLs and dates.
- Licensed authoritative standards pack references.
- Customer or company rule packs.

## Implementation notes

- Do not copy protected standards text into open data files.
- Store standard identifiers and links only unless redistribution rights are documented.
- Prefer user-provided or company-provided rule packs for proprietary rules.
- Show confidence labels in every report.

## Stub

See `MaterialsStandardsAdapter` in `src/mechaflow_cad/integrations/stub_adapters.py`.
