"""Core local MVP domain services."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from uuid import uuid4

from pydantic import ValidationError

from .models import (
    AnalysisReport,
    BOMItem,
    ManufacturingProcess,
    Modification,
    Part,
    PartDimensions,
    PartManufacturingOptions,
    Project,
    ProjectModificationResponse,
    ProjectPanelData,
    ReportStatus,
    TaskRequirement,
    WiringRoute,
)


class ProjectModificationError(ValueError):
    """Base error for project modification validation."""


class PartNotFoundError(ProjectModificationError):
    """Raised when a modification targets an unknown part id."""


class MaterialNotFoundError(ProjectModificationError):
    """Raised when a modification references a material missing from the project."""


class MaterialProcessCompatibilityError(ProjectModificationError):
    """Raised when a requested material and process are not valid for a part."""


class InvalidDimensionChangeError(ProjectModificationError):
    """Raised when dimension change keys or values cannot be applied."""


_EDITABLE_DIMENSION_FIELDS = {"length_mm", "width_mm", "height_mm", "thickness_mm"}


def apply_project_modification(project: Project, modification: Modification) -> ProjectModificationResponse:
    """Apply a local task-preserving part edit and generate an advisory report.

    This service is deliberately deterministic and light enough for local API
    tests. It does not invoke CAD, FEA, wiring, or supplier integrations.
    """

    target_part = _find_part(project, modification.target_part_id)
    _validate_material_process(project, target_part, modification)
    changed_keys = _validate_dimension_keys(modification)
    now = datetime.now(timezone.utc)
    edited_part = _apply_part_update(target_part, modification)
    updated_assemblies = []

    for assembly in project.assemblies:
        updated_parts = []
        for part in assembly.parts:
            if part.id != modification.target_part_id:
                updated_parts.append(part)
                continue
            updated_parts.append(edited_part)
        updated_assemblies.append(assembly.model_copy(update={"parts": updated_parts}))

    report = _build_modification_report(project, edited_part, modification, changed_keys, now)
    updated_project = project.model_copy(
        update={
            "assemblies": updated_assemblies,
            "modifications": [*project.modifications, modification],
            "reports": [*project.reports, report],
            "updated_at": now,
        }
    )
    return ProjectModificationResponse(project=updated_project, report=report)


def _find_part(project: Project, part_id: str) -> Part:
    for assembly in project.assemblies:
        for part in assembly.parts:
            if part.id == part_id:
                return part
    raise PartNotFoundError(part_id)


def _validate_material_process(project: Project, part: Part, modification: Modification) -> None:
    if modification.material_id is None and modification.manufacturing_process is None:
        return
    material_id = part.material_id if modification.material_id is None else modification.material_id
    material = next((candidate for candidate in project.materials if candidate.id == material_id), None)
    if material is None:
        if modification.material_id is not None:
            raise MaterialNotFoundError(modification.material_id)
        raise MaterialProcessCompatibilityError("material and process compatibility requires review")
    part_processes = {option.process for option in part.manufacturing_options}
    material_processes = set(material.compatible_processes)
    part_processes.discard(ManufacturingProcess.unknown)
    material_processes.discard(ManufacturingProcess.unknown)
    if not part_processes or not material_processes:
        raise MaterialProcessCompatibilityError("material and process compatibility requires review")
    compatible_processes = part_processes & material_processes
    current_process_value = part.metadata.get("preferred_manufacturing_process")
    try:
        current_process = ManufacturingProcess(current_process_value) if isinstance(current_process_value, str) else None
    except ValueError:
        current_process = None
    effective_process = modification.manufacturing_process or current_process
    if modification.material_id is not None and effective_process is None:
        raise MaterialProcessCompatibilityError("material changes require an explicit compatible manufacturing process")
    if effective_process is not None and effective_process not in compatible_processes:
        raise MaterialProcessCompatibilityError(
            f"{material.id} is incompatible with {effective_process.value} for {part.id}"
        )
    if not compatible_processes:
        raise MaterialProcessCompatibilityError(f"{material.id} has no compatible process for {part.id}")


def _validate_dimension_keys(modification: Modification) -> list[str]:
    invalid_keys = sorted(set(modification.dimension_changes) - _EDITABLE_DIMENSION_FIELDS)
    if invalid_keys:
        raise InvalidDimensionChangeError(
            f"dimension_changes can only include {sorted(_EDITABLE_DIMENSION_FIELDS)}, got {invalid_keys}"
        )
    nonfinite_keys = sorted(
        key for key, value in modification.dimension_changes.items() if not math.isfinite(value)
    )
    if nonfinite_keys:
        raise InvalidDimensionChangeError(f"dimension_changes must be finite, got {nonfinite_keys}")
    return sorted(modification.dimension_changes)


def _apply_part_update(part: Part, modification: Modification) -> Part:
    updates = {}
    if modification.material_id is not None:
        updates["material_id"] = modification.material_id
    if modification.dimension_changes:
        dimension_data = part.dimensions.model_dump()
        dimension_data.update(modification.dimension_changes)
        try:
            updates["dimensions"] = PartDimensions(**dimension_data)
        except ValidationError as exc:
            raise InvalidDimensionChangeError(str(exc)) from exc
    if modification.material_id is not None or modification.dimension_changes:
        updates["mass_kg"] = None
    if modification.manufacturing_process is not None:
        metadata = dict(part.metadata)
        metadata["preferred_manufacturing_process"] = modification.manufacturing_process.value
        updates["metadata"] = metadata
    return part.model_copy(update=updates)


def _build_modification_report(
    project: Project,
    edited_part: Part,
    modification: Modification,
    changed_keys: list[str],
    generated_at: datetime,
) -> AnalysisReport:
    task_description = project.active_task.description if project.active_task else "No active task is set."
    task_kind = project.active_task.kind.value if project.active_task else "unknown"
    material_note = f"Material set to {modification.material_id}." if modification.material_id else "Material unchanged."
    dimension_note = (
        f"Dimensions changed: {', '.join(changed_keys)}." if changed_keys else "No dimensions changed."
    )
    process_note = (
        f"Preferred process set to {modification.manufacturing_process.value}."
        if modification.manufacturing_process
        else "Manufacturing process unchanged."
    )
    wiring_note = (
        "Target part has wiring routes; clearance and bend radius need a worker check."
        if edited_part.wiring_route_ids
        else "No wiring routes are linked to this part in the current assembly metadata."
    )

    return AnalysisReport(
        id=f"report-{uuid4()}",
        project_id=project.id,
        title=f"Advisory edit report for {edited_part.name}",
        status=ReportStatus.requires_review,
        summary=(
            f"Applied local edit '{modification.description}' to {edited_part.name}. "
            "Payload, fatigue, wiring, and manufacturability are not re-rated until real workers run."
        ),
        task_results=[
            {
                "task_kind": task_kind,
                "task_description": task_description,
                "status": "requires_review",
                "method": "local_schema_update_only",
                "notes": [material_note, dimension_note, process_note],
            }
        ],
        manufacturing_impacts=[process_note],
        wiring_impacts=[wiring_note],
        risks=[
            "Local edit preview does not modify CAD geometry yet.",
            "Strength, payload, and fatigue changes are advisory until FreeCAD and FEA workers validate them.",
        ],
        unknowns=[
            "Updated mass properties are unknown until a CAD worker recalculates them.",
            "Supplier cost and lead time are unknown until a supplier adapter runs.",
        ],
        recommendations=[
            "Queue estimate_mass_properties after CAD worker integration.",
            "Queue rerate_payload_capability before treating this edit as engineering guidance.",
        ],
        assumptions=["Part-level schema update is enough for frontend edit flow prototyping."],
        generated_at=generated_at,
    )


def collect_project_task_requirements(project: Project) -> list[TaskRequirement]:
    return [project.active_task] if project.active_task else []


def collect_project_bom_items(project: Project) -> list[BOMItem]:
    items: list[BOMItem] = []
    for assembly in project.assemblies:
        for part in assembly.parts:
            items.append(
                BOMItem(
                    id=f"bom-{part.id}",
                    part_id=part.id,
                    name=part.name,
                    quantity=1,
                    unit="part",
                    license_or_terms="Derived from local project assembly metadata",
                )
            )
    return items


def collect_project_manufacturing_options(project: Project) -> list[PartManufacturingOptions]:
    options: list[PartManufacturingOptions] = []
    for assembly in project.assemblies:
        for part in assembly.parts:
            options.append(
                PartManufacturingOptions(
                    part_id=part.id,
                    part_name=part.name,
                    material_id=part.material_id,
                    options=part.manufacturing_options,
                )
            )
    return options


def collect_project_wiring_routes(project: Project) -> list[WiringRoute]:
    routes: list[WiringRoute] = []
    seen_ids: set[str] = set()
    for assembly in project.assemblies:
        for route in assembly.wiring_routes:
            if route.id in seen_ids:
                continue
            routes.append(route)
            seen_ids.add(route.id)
    return routes


def build_project_panel_data(project: Project) -> ProjectPanelData:
    return ProjectPanelData(
        project=project,
        task_requirements=collect_project_task_requirements(project),
        bom_items=collect_project_bom_items(project),
        manufacturing_options=collect_project_manufacturing_options(project),
        wiring_routes=collect_project_wiring_routes(project),
        reports=project.reports,
    )
