#!/usr/bin/env python3
"""Validate MechaFlow CAD seed catalog files."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
REFERENCE_DESIGNS = ROOT / "catalog" / "reference-designs" / "reference-designs.seed.json"
REFERENCE_DESIGN_SCHEMA = ROOT / "catalog" / "schemas" / "reference-design.schema.json"
INTEGRATION_ADAPTERS = ROOT / "data" / "integration-adapters.seed.json"
BACKEND_FRONTEND_HANDOFF = ROOT / "data" / "backend-frontend-handoff.seed.json"
DATA_FILES = {
    "materials": ROOT / "data" / "materials.seed.json",
    "tasks": ROOT / "data" / "tasks.seed.json",
    "manufacturing-methods": ROOT / "data" / "manufacturing-methods.seed.json",
    "capability-ratings": ROOT / "data" / "capability-ratings.seed.json",
    "standards-advisory-rules": ROOT / "data" / "standards-advisory-rules.seed.json",
}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
BACKEND_JOB_TYPES = {
    "import_design",
    "generate_exploded_view",
    "extract_part_list",
    "estimate_mass_properties",
    "quick_load_heuristic",
    "run_fea",
    "rerate_payload_capability",
    "check_wire_routing",
    "generate_bom",
    "generate_manufacturing_report",
}
BACKEND_ARTIFACT_KINDS = {
    "cad_metadata",
    "exploded_view",
    "part_list",
    "mass_properties",
    "load_heuristic",
    "fea_summary",
    "payload_rerating",
    "wiring_check",
    "bom",
    "manufacturing_report",
}
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


def validate_unique_ids(name: str, items: list[Any], errors: list[str]) -> set[str]:
    seen: set[str] = set()
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            ensure(False, f"{name}[{index}] must be an object", errors)
            continue
        item_id = item.get("id")
        ensure(isinstance(item_id, str) and bool(ID_RE.match(item_id)), f"{name}[{index}] has invalid id {item_id!r}", errors)
        if isinstance(item_id, str):
            ensure(item_id not in seen, f"{name} duplicate id {item_id}", errors)
            seen.add(item_id)
    return seen


def validate_reference_design_schema(designs: list[Any], errors: list[str]) -> set[int]:
    schema = load_json(REFERENCE_DESIGN_SCHEMA)
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    invalid_indexes: set[int] = set()
    for index, design in enumerate(designs):
        validation_errors = sorted(
            validator.iter_errors(design),
            key=lambda item: tuple(map(str, item.absolute_path)),
        )
        if validation_errors:
            invalid_indexes.add(index)
        for error in validation_errors:
            location = ".".join(str(part) for part in error.absolute_path)
            suffix = f".{location}" if location else ""
            errors.append(f"reference-designs[{index}]{suffix}: {error.message}")
    return invalid_indexes


def validate_reference_designs(
    errors: list[str],
    adapter_ids: set[str],
    ids_by_name: dict[str, set[str]],
) -> set[str]:
    designs = load_json(REFERENCE_DESIGNS)
    ensure(isinstance(designs, list), "reference designs root must be a list", errors)
    if not isinstance(designs, list):
        return set()
    invalid_indexes = validate_reference_design_schema(designs, errors)
    design_ids = validate_unique_ids("reference-designs", designs, errors)

    for index, design in enumerate(designs):
        if index in invalid_indexes or not isinstance(design, dict):
            continue
        design_id = design.get("id", "<unknown>")
        license_data = design["license"]
        review = design["review"]
        compatibility = license_data.get("compatibility")
        ensure(bool(license_data.get("declared")), f"{design_id} must record declared license text", errors)
        ensure(bool(license_data.get("evidence")), f"{design_id} must record license evidence", errors)
        ensure(license_data.get("review_required_before_import") is True, f"{design_id} must require review before import", errors)
        if compatibility in {"uncertain", "conditional", "not-compatible"}:
            ensure(
                bool(license_data.get("cautions")),
                f"{design_id} must include cautions when compatibility is {compatibility}",
                errors,
            )
            ensure(
                review.get("status") in {"needs-license-review", "blocked"},
                f"{design_id} must not be marked ready while compatibility is {compatibility}",
                errors,
            )

        intent = design["engineering_intent"]
        for field, dataset, label in CROSS_REFERENCES:
            for value in intent.get(field, []):
                ensure(
                    value in ids_by_name.get(dataset, set()),
                    f"{design_id} references unknown {label} {value}",
                    errors,
                )

        handoff = design["handoff"]
        ensure(bool(handoff.get("license_gate")), f"{design_id} handoff must include license_gate", errors)
        for adapter_id in handoff.get("required_adapter_ids", []):
            ensure(adapter_id in adapter_ids, f"{design_id} handoff references unknown adapter {adapter_id}", errors)
        for job_type in handoff.get("recommended_job_types", []):
            ensure(job_type in BACKEND_JOB_TYPES, f"{design_id} handoff references unknown backend job type {job_type}", errors)

    return design_ids


def validate_datasets(errors: list[str]) -> dict[str, set[str]]:
    ids_by_name: dict[str, set[str]] = {}
    for name, path in DATA_FILES.items():
        items = load_json(path)
        ensure(isinstance(items, list), f"{name} root must be a list", errors)
        if not isinstance(items, list):
            continue
        ids = validate_unique_ids(name, items, errors)
        ensure(bool(ids), f"{name} must not be empty", errors)
        ids_by_name[name] = ids
    return ids_by_name


def validate_integration_adapters(errors: list[str]) -> set[str]:
    adapters = load_json(INTEGRATION_ADAPTERS)
    ensure(isinstance(adapters, list), "integration adapters root must be a list", errors)
    if not isinstance(adapters, list):
        return set()
    adapter_ids = validate_unique_ids("integration-adapters", adapters, errors)
    for adapter in adapters:
        if not isinstance(adapter, dict):
            continue
        adapter_id = adapter.get("id", "<unknown>")
        doc_path = adapter.get("documentation_path")
        ensure(isinstance(doc_path, str) and (ROOT / doc_path).exists(), f"{adapter_id} documentation_path is missing", errors)
        ensure(bool(adapter.get("stub_class")), f"{adapter_id} must record stub_class", errors)
        ensure(isinstance(adapter.get("required_tools"), list), f"{adapter_id} required_tools must be a list", errors)
        ensure(adapter.get("dependency_policy") is not None, f"{adapter_id} must record dependency_policy", errors)
        capabilities = adapter.get("capabilities", [])
        ensure(isinstance(capabilities, list), f"{adapter_id} capabilities must be a list", errors)
        if not isinstance(capabilities, list):
            continue
        for capability in capabilities:
            if not isinstance(capability, dict):
                ensure(False, f"{adapter_id} capability must be an object", errors)
                continue
            capability_id = capability.get("id", "<unknown>")
            job_types = capability.get("backend_job_types", [])
            ensure(isinstance(job_types, list), f"{adapter_id}:{capability_id} backend_job_types must be a list", errors)
            if isinstance(job_types, list):
                for job_type in job_types:
                    ensure(
                        job_type in BACKEND_JOB_TYPES,
                        f"{adapter_id}:{capability_id} has unknown job type {job_type}",
                        errors,
                    )
            artifact_kinds = capability.get("expected_artifacts", [])
            ensure(
                isinstance(artifact_kinds, list),
                f"{adapter_id}:{capability_id} expected_artifacts must be a list",
                errors,
            )
            if isinstance(artifact_kinds, list):
                for artifact_kind in artifact_kinds:
                    ensure(
                        artifact_kind in BACKEND_ARTIFACT_KINDS,
                        f"{adapter_id}:{capability_id} has unknown artifact kind {artifact_kind}",
                        errors,
                    )
    return adapter_ids


def validate_handoff(errors: list[str], ids_by_name: dict[str, set[str]], design_ids: set[str], adapter_ids: set[str]) -> None:
    handoff = load_json(BACKEND_FRONTEND_HANDOFF)
    ensure(isinstance(handoff, dict), "backend frontend handoff root must be an object", errors)
    if not isinstance(handoff, dict):
        return
    ensure(handoff.get("schema_version") == "backend-frontend-handoff.v1", "handoff has wrong schema_version", errors)

    aliases = handoff.get("id_aliases", {})
    for item in aliases.get("reference_designs", []):
        catalog_id = item.get("catalog_id")
        ensure(catalog_id in design_ids, f"handoff aliases unknown reference design {catalog_id}", errors)
    for item in aliases.get("materials", []):
        catalog_id = item.get("catalog_id")
        ensure(catalog_id in ids_by_name.get("materials", set()), f"handoff aliases unknown material {catalog_id}", errors)
    for item in aliases.get("manufacturing_methods", []):
        catalog_id = item.get("catalog_id")
        ensure(catalog_id in ids_by_name.get("manufacturing-methods", set()), f"handoff aliases unknown manufacturing method {catalog_id}", errors)
    for item in aliases.get("tasks", []):
        catalog_id = item.get("catalog_id")
        ensure(catalog_id in ids_by_name.get("tasks", set()), f"handoff aliases unknown task {catalog_id}", errors)
    for item in aliases.get("capability_ratings", []):
        catalog_id = item.get("catalog_id")
        artifact_kind = item.get("backend_artifact_kind")
        ensure(catalog_id in ids_by_name.get("capability-ratings", set()), f"handoff aliases unknown rating {catalog_id}", errors)
        ensure(artifact_kind in BACKEND_ARTIFACT_KINDS, f"handoff aliases unknown artifact kind {artifact_kind}", errors)
    for item in aliases.get("adapters", []):
        catalog_id = item.get("catalog_id")
        ensure(catalog_id in adapter_ids, f"handoff aliases unknown adapter {catalog_id}", errors)

    project = handoff.get("mvp_seed_project", {})
    reference_design_id = project.get("reference_design_id")
    ensure(reference_design_id in design_ids, f"handoff mvp_seed_project references unknown design {reference_design_id}", errors)
    ensure(bool(project.get("license_gate")), "handoff mvp_seed_project must keep license_gate visible", errors)
    sample_parts = project.get("sample_parts", [])
    parts_by_id = {
        part.get("id"): part
        for part in sample_parts
        if isinstance(part, dict) and isinstance(part.get("id"), str)
    }
    sample_routes = project.get("sample_wiring_routes", [])
    routes_by_id = {
        route.get("id"): route
        for route in sample_routes
        if isinstance(route, dict) and isinstance(route.get("id"), str)
    }
    for part in sample_parts:
        part_id = part.get("id", "<unknown>")
        ensure(part.get("material_id") in ids_by_name.get("materials", set()), f"{part_id} references unknown material", errors)
        ensure(
            part.get("manufacturing_method_id") in ids_by_name.get("manufacturing-methods", set()),
            f"{part_id} references unknown manufacturing method",
            errors,
        )
        for rating_id in part.get("capability_rating_ids", []):
            ensure(rating_id in ids_by_name.get("capability-ratings", set()), f"{part_id} references unknown rating {rating_id}", errors)
        for route_id in part.get("wiring_route_ids", []):
            route = routes_by_id.get(route_id)
            ensure(route is not None, f"{part_id} references unknown wiring route {route_id}", errors)
            if route is not None:
                ensure(
                    part_id in {route.get("from_part_id"), route.get("to_part_id")},
                    f"{part_id} lists unrelated wiring route {route_id}",
                    errors,
                )
    for route in sample_routes:
        route_id = route.get("id", "<unknown>")
        for endpoint_field in ("from_part_id", "to_part_id"):
            endpoint_id = route.get(endpoint_field)
            endpoint = parts_by_id.get(endpoint_id)
            ensure(endpoint is not None, f"{route_id} references unknown endpoint part {endpoint_id}", errors)
            if endpoint is not None:
                ensure(
                    route_id in endpoint.get("wiring_route_ids", []),
                    f"{endpoint_id} does not list endpoint wiring route {route_id}",
                    errors,
                )
        for adapter_id in route.get("adapter_ids", []):
            ensure(adapter_id in adapter_ids, f"{route_id} references unknown adapter {adapter_id}", errors)
    for job in project.get("analysis_job_sequence", []):
        ensure(job.get("job_type") in BACKEND_JOB_TYPES, f"handoff job has unknown job_type {job.get('job_type')}", errors)
        ensure(job.get("adapter_id") in adapter_ids, f"handoff job references unknown adapter {job.get('adapter_id')}", errors)
        ensure(job.get("artifact_kind") in BACKEND_ARTIFACT_KINDS, f"handoff job has unknown artifact {job.get('artifact_kind')}", errors)
        ensure(
            any(alias.get("catalog_id") == job.get("adapter_id") for alias in aliases.get("adapters", [])),
            f"handoff job adapter {job.get('adapter_id')} has no backend alias",
            errors,
        )


def main() -> int:
    errors: list[str] = []
    try:
        ids_by_name = validate_datasets(errors)
        adapter_ids = validate_integration_adapters(errors)
        design_ids = validate_reference_designs(errors, adapter_ids, ids_by_name)
        validate_handoff(errors, ids_by_name, design_ids, adapter_ids)
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
