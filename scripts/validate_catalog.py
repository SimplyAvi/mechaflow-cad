#!/usr/bin/env python3
"""Validate MechaFlow CAD seed catalog files with the Python standard library."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
REFERENCE_SCHEMA = ROOT / "catalog" / "schemas" / "reference-design.schema.json"
REFERENCE_DESIGNS = ROOT / "catalog" / "reference-designs" / "reference-designs.seed.json"
DATA_FILES = {
    "materials": ROOT / "data" / "materials.seed.json",
    "tasks": ROOT / "data" / "tasks.seed.json",
    "manufacturing-methods": ROOT / "data" / "manufacturing-methods.seed.json",
    "capability-ratings": ROOT / "data" / "capability-ratings.seed.json",
    "standards-advisory-rules": ROOT / "data" / "standards-advisory-rules.seed.json",
}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
JSON_TYPES: dict[str, Any] = {
    "object": dict,
    "array": list,
    "string": str,
    "boolean": bool,
    "number": (int, float),
    "integer": int,
}
BLOCKING_COMPATIBILITY = {"uncertain", "conditional", "not-compatible"}
CROSS_REFERENCES = (
    ("example_task_ids", "tasks", "task"),
    ("primary_material_ids", "materials", "material"),
    ("manufacturing_method_ids", "manufacturing-methods", "manufacturing method"),
    ("capability_rating_ids", "capability-ratings", "capability rating"),
)


def load_json(path: Path) -> Any:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: invalid JSON: {exc}") from exc


def ensure(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def has_json_type(value: Any, expected: str) -> bool:
    python_type = JSON_TYPES.get(expected)
    if python_type is None:
        return True
    if expected == "boolean":
        return isinstance(value, bool)
    if expected in {"number", "integer"} and isinstance(value, bool):
        return False
    return isinstance(value, python_type)


def check_schema(value: Any, schema: dict[str, Any], defs: dict[str, Any], path: str, errors: list[str]) -> None:
    """Check a value against the subset of JSON Schema used by the catalog schema."""
    if "$ref" in schema:
        schema = defs[schema["$ref"].rsplit("/", 1)[-1]]

    expected = schema.get("type")
    if expected is not None and not has_json_type(value, expected):
        errors.append(f"{path} must be a JSON {expected}")
        return
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path} must be {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path} must be one of {sorted(schema['enum'])}")

    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{path} must not be empty")
        pattern = schema.get("pattern")
        if pattern is not None and not re.match(pattern, value):
            errors.append(f"{path} must match {pattern}")
        if schema.get("format") == "uri" and not urlsplit(value).scheme:
            errors.append(f"{path} must be an absolute URI")

    if isinstance(value, dict):
        properties = schema.get("properties", {})
        missing = set(schema.get("required", [])) - set(value)
        ensure(not missing, f"{path} missing required fields: {sorted(missing)}", errors)
        if schema.get("additionalProperties") is False:
            unknown = set(value) - set(properties)
            ensure(not unknown, f"{path} has unknown fields: {sorted(unknown)}", errors)
        for key, child in value.items():
            if key in properties:
                check_schema(child, properties[key], defs, f"{path}.{key}", errors)

    if isinstance(value, list) and "items" in schema:
        for index, child in enumerate(value):
            check_schema(child, schema["items"], defs, f"{path}[{index}]", errors)


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
    schema = load_json(REFERENCE_SCHEMA)
    defs = schema.get("$defs", {})
    designs = load_json(REFERENCE_DESIGNS)
    ensure(isinstance(designs, list), "reference designs root must be a list", errors)
    if not isinstance(designs, list):
        return
    validate_unique_ids("reference-designs", designs, errors)

    for index, design in enumerate(designs):
        if not isinstance(design, dict):
            continue
        design_id = design["id"] if isinstance(design.get("id"), str) else f"reference-designs[{index}]"
        check_schema(design, schema, defs, design_id, errors)

        license_data = design.get("license")
        review = design.get("review")
        if not isinstance(license_data, dict) or not isinstance(review, dict):
            continue
        compatibility = license_data.get("compatibility")
        if compatibility in BLOCKING_COMPATIBILITY:
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

        intent = design.get("engineering_intent")
        if not isinstance(intent, dict):
            continue
        for field, dataset, label in CROSS_REFERENCES:
            values = intent.get(field, [])
            if not isinstance(values, list):
                continue
            for value in values:
                ensure(
                    value in dataset_ids.get(dataset, set()),
                    f"{design_id} references unknown {label} {value}",
                    errors,
                )


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
