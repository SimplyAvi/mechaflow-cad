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
NESTED_REQUIRED = {
    "source": {"url", "retrieved_at"},
    "license": {"declared", "compatibility", "evidence", "cautions"},
    "openness": {"design_files_available", "commercial_use_known", "redistribution_known"},
    "assets": {"cad", "electronics", "bom", "documentation"},
    "engineering_intent": {
        "example_tasks",
        "capability_rating_ids",
        "primary_material_ids",
        "manufacturing_method_ids",
    },
    "review": {"status", "reviewed_by", "reviewed_at", "next_actions"},
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


def validate_unique_ids(name: str, items: list[Any], errors: list[str]) -> set[str]:
    seen: set[str] = set()
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"{name}[{index}] must be an object")
            continue
        item_id = item.get("id")
        ensure(isinstance(item_id, str) and bool(ID_RE.match(item_id)), f"{name}[{index}] has invalid id {item_id!r}", errors)
        if isinstance(item_id, str):
            ensure(item_id not in seen, f"{name} duplicate id {item_id}", errors)
            seen.add(item_id)
    return seen


def validate_reference_designs(dataset_ids: dict[str, set[str]], errors: list[str]) -> None:
    designs = load_json(REFERENCE_DESIGNS)
    ensure(isinstance(designs, list), "reference designs root must be a list", errors)
    if not isinstance(designs, list):
        return
    validate_unique_ids("reference-designs", designs, errors)

    material_ids = dataset_ids.get("materials", set())
    manufacturing_ids = dataset_ids.get("manufacturing-methods", set())
    rating_ids = dataset_ids.get("capability-ratings", set())

    for index, design in enumerate(designs):
        if not isinstance(design, dict):
            continue
        design_id = design.get("id", f"<index {index}>")
        missing = REFERENCE_REQUIRED - set(design)
        ensure(not missing, f"{design_id} missing required fields: {sorted(missing)}", errors)
        ensure(design.get("schema_version") == "reference-design.v1", f"{design_id} has wrong schema_version", errors)

        sections: dict[str, dict[str, Any]] = {}
        for section_name, required_keys in NESTED_REQUIRED.items():
            if section_name not in design:
                continue
            section = design[section_name]
            if not isinstance(section, dict):
                errors.append(f"{design_id}.{section_name} must be an object")
                continue
            sections[section_name] = section
            missing_nested = required_keys - set(section)
            ensure(
                not missing_nested,
                f"{design_id}.{section_name} missing required fields: {sorted(missing_nested)}",
                errors,
            )

        license_data = sections.get("license", {})
        review = sections.get("review", {})
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
                review.get("status") != "ready-for-import",
                f"{design_id} must not be marked ready-for-import while compatibility is {compatibility}",
                errors,
            )

        ensure(review.get("status") in REVIEW_STATUSES, f"{design_id} has invalid review status", errors)

        intent = sections.get("engineering_intent", {})
        for field, known_ids, label in (
            ("primary_material_ids", material_ids, "material"),
            ("manufacturing_method_ids", manufacturing_ids, "manufacturing method"),
            ("capability_rating_ids", rating_ids, "capability rating"),
        ):
            values = intent.get(field, [])
            if not isinstance(values, list):
                errors.append(f"{design_id}.engineering_intent.{field} must be a list")
                continue
            for value in values:
                ensure(value in known_ids, f"{design_id} references unknown {label} {value}", errors)


def validate_datasets(errors: list[str]) -> dict[str, set[str]]:
    dataset_ids: dict[str, set[str]] = {}
    for name, path in DATA_FILES.items():
        items = load_json(path)
        ensure(isinstance(items, list), f"{name} root must be a list", errors)
        if not isinstance(items, list):
            continue
        ids = validate_unique_ids(name, items, errors)
        ensure(bool(ids), f"{name} must not be empty", errors)
        dataset_ids[name] = ids
    return dataset_ids


def main() -> int:
    errors: list[str] = []
    try:
        dataset_ids = validate_datasets(errors)
        validate_reference_designs(dataset_ids, errors)
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
