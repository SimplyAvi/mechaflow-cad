#!/usr/bin/env python3
"""Validate MechaFlow CAD seed catalog files with the Python standard library."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REFERENCE_DESIGNS = ROOT / "catalog" / "reference-designs" / "reference-designs.seed.json"
DATA_FILES = {
    "materials": ROOT / "data" / "materials.seed.json",
    "tasks": ROOT / "data" / "tasks.seed.json",
    "manufacturing-methods": ROOT / "data" / "manufacturing-methods.seed.json",
    "capability-ratings": ROOT / "data" / "capability-ratings.seed.json",
    "standards-advisory-rules": ROOT / "data" / "standards-advisory-rules.seed.json",
}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
REFERENCE_REQUIRED = {
    "schema_version",
    "id",
    "name",
    "summary",
    "source",
    "license",
    "openness",
    "assets",
    "engineering_intent",
    "integration_notes",
    "review",
}
LICENSE_COMPATIBILITY = {"appears-compatible", "conditional", "not-compatible", "uncertain"}
REVIEW_STATUSES = {"seed", "needs-license-review", "ready-for-import", "blocked"}


def load_json(path: Path) -> Any:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: invalid JSON: {exc}") from exc


def ensure(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def validate_unique_ids(name: str, items: list[dict[str, Any]], errors: list[str]) -> set[str]:
    seen: set[str] = set()
    for index, item in enumerate(items):
        item_id = item.get("id")
        ensure(isinstance(item_id, str) and bool(ID_RE.match(item_id)), f"{name}[{index}] has invalid id {item_id!r}", errors)
        if isinstance(item_id, str):
            ensure(item_id not in seen, f"{name} duplicate id {item_id}", errors)
            seen.add(item_id)
    return seen


def validate_reference_designs(errors: list[str]) -> None:
    designs = load_json(REFERENCE_DESIGNS)
    ensure(isinstance(designs, list), "reference designs root must be a list", errors)
    if not isinstance(designs, list):
        return
    validate_unique_ids("reference-designs", designs, errors)

    material_ids = validate_unique_ids("materials", load_json(DATA_FILES["materials"]), errors)
    manufacturing_ids = validate_unique_ids("manufacturing-methods", load_json(DATA_FILES["manufacturing-methods"]), errors)
    rating_ids = validate_unique_ids("capability-ratings", load_json(DATA_FILES["capability-ratings"]), errors)

    for design in designs:
        design_id = design.get("id", "<unknown>")
        missing = REFERENCE_REQUIRED - set(design)
        ensure(not missing, f"{design_id} missing required fields: {sorted(missing)}", errors)
        ensure(design.get("schema_version") == "reference-design.v1", f"{design_id} has wrong schema_version", errors)

        license_data = design.get("license", {})
        compatibility = license_data.get("compatibility")
        ensure(compatibility in LICENSE_COMPATIBILITY, f"{design_id} has invalid license compatibility", errors)
        ensure(bool(license_data.get("declared")), f"{design_id} must record declared license text", errors)
        ensure(bool(license_data.get("evidence")), f"{design_id} must record license evidence", errors)
        if compatibility in {"uncertain", "conditional", "not-compatible"}:
            ensure(
                bool(license_data.get("cautions")),
                f"{design_id} must include cautions when compatibility is {compatibility}",
                errors,
            )
            ensure(
                design.get("review", {}).get("status") in {"needs-license-review", "blocked"},
                f"{design_id} must not be marked ready while compatibility is {compatibility}",
                errors,
            )

        review_status = design.get("review", {}).get("status")
        ensure(review_status in REVIEW_STATUSES, f"{design_id} has invalid review status", errors)

        intent = design.get("engineering_intent", {})
        for material_id in intent.get("primary_material_ids", []):
            ensure(material_id in material_ids, f"{design_id} references unknown material {material_id}", errors)
        for method_id in intent.get("manufacturing_method_ids", []):
            ensure(method_id in manufacturing_ids, f"{design_id} references unknown manufacturing method {method_id}", errors)
        for rating_id in intent.get("capability_rating_ids", []):
            ensure(rating_id in rating_ids, f"{design_id} references unknown capability rating {rating_id}", errors)


def validate_datasets(errors: list[str]) -> None:
    for name, path in DATA_FILES.items():
        items = load_json(path)
        ensure(isinstance(items, list), f"{name} root must be a list", errors)
        if not isinstance(items, list):
            continue
        ids = validate_unique_ids(name, items, errors)
        ensure(bool(ids), f"{name} must not be empty", errors)


def main() -> int:
    errors: list[str] = []
    try:
        validate_datasets(errors)
        validate_reference_designs(errors)
    except ValueError as exc:
        errors.append(str(exc))

    if errors:
        print("Catalog validation failed:")
        for error in errors:
            print(f" - {error}")
        return 1
    print("Catalog validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
