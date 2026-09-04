"""Core local MVP domain services."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from pydantic import ValidationError

from .models import (
    AnalysisConstraint,
    AnalysisConstraintType,
    AnalysisJobRequest,
    AnalysisJobType,
    AnalysisLoadCase,
    AnalysisLoadType,
    AnalysisMaterialPropertySet,
    AnalysisReadinessPreview,
    AnalysisReadinessState,
    AnalysisReport,
    AnalysisResultTrust,
    AnalysisThermalGuidance,
    BOMItem,
    ExpectedAnalysisResultArtifact,
    ManufacturingProcess,
    Material,
    Modification,
    Part,
    PartDimensions,
    PartManufacturingOptions,
    Project,
    ProjectModificationResponse,
    ProjectPanelData,
    RecommendationConfidence,
    ReportStatus,
    SolverInputSpec,
    SolverPipelineStep,
    SolverPipelineStepStatus,
    TaskRequirement,
    Vector3,
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
DEFAULT_SOLVER_MESH_SIZE_MM = 4.0


def apply_project_modification(project: Project, modification: Modification) -> ProjectModificationResponse:
    """Apply a local task-preserving part edit and generate an advisory report.

    This service is deliberately deterministic and light enough for local API
    tests. It does not invoke CAD, FEA, wiring, or supplier integrations.
    """

    target_part = _find_part(project, modification.target_part_id)
    _validate_material_process(project, target_part, modification)
    submitted_dimension_keys = _validate_dimension_keys(modification)
    now = datetime.now(timezone.utc)
    edited_part, material_changed, changed_keys, process_changed = _apply_part_update(
        target_part,
        modification,
        submitted_dimension_keys,
    )
    updated_assemblies = []

    for assembly in project.assemblies:
        updated_parts = []
        for part in assembly.parts:
            if part.id != modification.target_part_id:
                updated_parts.append(part)
                continue
            updated_parts.append(edited_part)
        updated_assemblies.append(assembly.model_copy(update={"parts": updated_parts}))

    report = _build_modification_report(
        project,
        edited_part,
        modification,
        material_changed,
        changed_keys,
        process_changed,
        now,
    )
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
    material_changed = modification.material_id is not None and modification.material_id != part.material_id
    if not material_changed and modification.manufacturing_process is None:
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
    if material_changed and effective_process is None:
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


def _apply_part_update(
    part: Part,
    modification: Modification,
    submitted_dimension_keys: list[str],
) -> tuple[Part, bool, list[str], bool]:
    updates = {}
    material_changed = modification.material_id is not None and modification.material_id != part.material_id
    if modification.material_id is not None:
        updates["material_id"] = modification.material_id
    changed_dimension_keys: list[str] = []
    if modification.dimension_changes:
        dimension_data = part.dimensions.model_dump()
        dimension_data.update(modification.dimension_changes)
        try:
            updated_dimensions = PartDimensions(**dimension_data)
        except ValidationError as exc:
            raise InvalidDimensionChangeError(str(exc)) from exc
        changed_dimension_keys = [
            key
            for key in submitted_dimension_keys
            if getattr(updated_dimensions, key) != getattr(part.dimensions, key)
        ]
        updates["dimensions"] = updated_dimensions
    if material_changed or changed_dimension_keys:
        updates["mass_kg"] = None
    current_process = part.metadata.get("preferred_manufacturing_process")
    process_changed = (
        modification.manufacturing_process is not None
        and modification.manufacturing_process.value != current_process
    )
    if modification.manufacturing_process is not None:
        metadata = dict(part.metadata)
        metadata["preferred_manufacturing_process"] = modification.manufacturing_process.value
        updates["metadata"] = metadata
    return part.model_copy(update=updates), material_changed, changed_dimension_keys, process_changed


def _build_modification_report(
    project: Project,
    edited_part: Part,
    modification: Modification,
    material_changed: bool,
    changed_keys: list[str],
    process_changed: bool,
    generated_at: datetime,
) -> AnalysisReport:
    task_description = project.active_task.description if project.active_task else "No active task is set."
    task_kind = project.active_task.kind.value if project.active_task else "unknown"
    material_note = (
        f"Material changed to {modification.material_id}." if material_changed else "Material unchanged."
    )
    dimension_note = (
        f"Dimensions changed: {', '.join(changed_keys)}." if changed_keys else "No dimensions changed."
    )
    process_note = (
        f"Preferred process changed to {modification.manufacturing_process.value}."
        if process_changed and modification.manufacturing_process
        else "Manufacturing process unchanged."
    )
    mass_properties_changed = material_changed or bool(changed_keys)
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
            *(
                ["Strength, payload, and fatigue changes are advisory until FreeCAD and FEA workers validate them."]
                if mass_properties_changed
                else []
            ),
        ],
        unknowns=[
            *(
                ["Updated mass properties are unknown until a CAD worker recalculates them."]
                if mass_properties_changed
                else []
            ),
            "Supplier cost and lead time are unknown until a supplier adapter runs.",
        ],
        recommendations=(
            [
                "Queue estimate_mass_properties after CAD worker integration.",
                "Queue rerate_payload_capability before treating this edit as engineering guidance.",
            ]
            if mass_properties_changed
            else []
        ),
        assumptions=["Part-level schema update is enough for frontend edit flow prototyping."],
        generated_at=generated_at,
    )


def _find_material(project: Project, part: Part) -> Material | None:
    if part.material_id is None:
        return None
    return next((material for material in project.materials if material.id == part.material_id), None)


def _part_demo_estimate(part: Part) -> tuple[float | None, str | None]:
    demo_criteria = part.metadata.get("demo_design_criteria")
    if not isinstance(demo_criteria, dict):
        return None, None
    capacity = demo_criteria.get("load_capacity_lb")
    note = demo_criteria.get("load_capacity_note")
    return (
        capacity if isinstance(capacity, (int, float)) and math.isfinite(capacity) else None,
        note if isinstance(note, str) and note.strip() else None,
    )


def _analysis_expected_artifacts() -> list[ExpectedAnalysisResultArtifact]:
    return [
        ExpectedAnalysisResultArtifact(
            kind="geometry_prep",
            title="FreeCAD analysis geometry package",
            file_format="STEP or BREP plus part-map JSON",
            produced_by="freecad-fea-prep-worker",
        ),
        ExpectedAnalysisResultArtifact(
            kind="mesh",
            title="Gmsh finite-element mesh",
            file_format=".msh plus mesh-quality JSON",
            produced_by="gmsh-meshing-worker",
        ),
        ExpectedAnalysisResultArtifact(
            kind="solver_deck",
            title="CalculiX static structural input deck",
            file_format=".inp",
            produced_by="calculix-fea-worker",
        ),
        ExpectedAnalysisResultArtifact(
            kind="solver_results",
            title="Stress, displacement, and safety-factor result package",
            file_format=".frd, .vtk, and advisory JSON report",
            produced_by="calculix-fea-worker",
        ),
    ]


def _analysis_solver_pipeline() -> list[SolverPipelineStep]:
    return [
        SolverPipelineStep(
            order=1,
            adapter_name="freecad-fea-prep-worker",
            open_source_tool="FreeCAD",
            action="Prepare defeatured analysis geometry, named faces, and units.",
            consumes=["source_file", "assembly nodes", "part metadata"],
            produces=["STEP or BREP analysis solid", "part-map JSON", "named-face set"],
            status=SolverPipelineStepStatus.ready_for_worker,
            review_notes=["Geometry prep is a contract only; the API does not import FreeCAD yet."],
        ),
        SolverPipelineStep(
            order=2,
            adapter_name="gmsh-meshing-worker",
            open_source_tool="Gmsh",
            action="Generate mesh with quality metrics and element-size provenance.",
            consumes=["analysis solid", "named faces", "mesh sizing policy"],
            produces=[".msh mesh", "mesh-quality JSON"],
            review_notes=["Mesh convergence and local refinement rules are future work."],
        ),
        SolverPipelineStep(
            order=3,
            adapter_name="calculix-fea-worker",
            open_source_tool="CalculiX",
            action="Run static structural solve from explicit loads, constraints, and material properties.",
            consumes=[".msh mesh", "material property JSON", "load and constraint JSON"],
            produces=[".inp deck", ".frd results", ".dat solver log"],
            review_notes=["No solver is invoked by the readiness preview endpoint."],
        ),
        SolverPipelineStep(
            order=4,
            adapter_name="fea-report-worker",
            open_source_tool="Python, VTK, and open report templates",
            action="Extract stress, displacement, safety factor, assumptions, and review-required flags.",
            consumes=["CalculiX results", "mesh-quality JSON", "task requirements"],
            produces=["analysis report JSON", "preview images", "review checklist"],
            review_notes=["Report artifacts will replace demo estimates only after a real solver completes."],
        ),
    ]


def build_analysis_readiness_preview(project: Project, target_id: str) -> AnalysisReadinessPreview:
    """Build an honest pre-solver preview without running CAD, meshing, or FEA."""

    target_part = next((part for assembly in project.assemblies for part in assembly.parts if part.id == target_id), None)
    target_assembly = next((assembly for assembly in project.assemblies if assembly.id == target_id), None)
    if target_part is None and target_assembly is None:
        raise PartNotFoundError(target_id)

    if target_part is not None:
        part_ids = [target_part.id]
        target_name = target_part.name
        target_kind: Literal["part", "assembly"] = "part"
        material = _find_material(project, target_part)
        source_file = target_part.source_file
        dimensions_ready = any(
            value is not None
            for value in (
                target_part.dimensions.length_mm,
                target_part.dimensions.width_mm,
                target_part.dimensions.height_mm,
                target_part.dimensions.thickness_mm,
            )
        )
        fastener_region = ", ".join(target_part.related_fasteners) or "fixture faces need CAD naming"
        demo_capacity_lb, demo_note = _part_demo_estimate(target_part)
    else:
        part_ids = [part.id for part in target_assembly.parts]
        target_name = target_assembly.name
        target_kind = "assembly"
        material = None
        source_file = None
        dimensions_ready = bool(part_ids)
        fastener_region = "assembly fixtures and contact sets need CAD naming"
        demo_capacity_lb, demo_note = None, None

    task = project.active_task
    has_payload_task = task is not None and task.kind.value == "lift_payload" and task.target_value is not None
    load_cases = []
    if has_payload_task:
        load_cases.append(
            AnalysisLoadCase(
                id=f"load-{target_id}-active-task",
                name="Preserved task static payload screening load",
                description=(
                    f"Use the active task target of {task.target_value:g} {task.unit or ''} as a pre-solver static load. "
                    "Load direction and contact patch must be reviewed before any real solve."
                ),
                load_type=AnalysisLoadType.force,
                target_part_ids=part_ids,
                magnitude=task.target_value,
                unit=task.unit,
                direction=Vector3(z=-1),
                application_region="estimated grip or reaction region from seed metadata",
                confidence=RecommendationConfidence.heuristic,
            )
        )

    constraints = [
        AnalysisConstraint(
            id=f"constraint-{target_id}-fixtures",
            name="Fixture and fastener support set",
            constraint_type=AnalysisConstraintType.pinned if target_part is not None else AnalysisConstraintType.review_required,
            target_part_ids=part_ids,
            region=fastener_region,
            degrees_of_freedom=["translation_x", "translation_y", "translation_z"],
            confidence=RecommendationConfidence.heuristic,
        )
    ]

    review_required = [
        "Named faces, contact regions, and fixture assumptions must be reviewed in CAD before solving.",
        "A qualified reviewer must approve any factor-of-safety interpretation before release.",
    ]
    if not has_payload_task:
        review_required.append("No load-bearing task was available for an explicit structural load case.")
    if target_part is not None and source_file is None:
        review_required.append("No source CAD file reference is attached to this part.")
    if target_part is not None and material is None:
        review_required.append("No material property set is attached to this part.")
    if not dimensions_ready:
        review_required.append("Geometry dimensions are incomplete for mesh sizing.")

    if material is not None:
        material_properties = AnalysisMaterialPropertySet(
            material_id=material.id,
            material_name=material.name,
            properties=material.properties,
            provenance=material.confidence,
            source=material.source,
            review_notes=[*material.notes, "Replace seed properties with a sourced material record before engineering use."],
        )
        heat_limit = material.properties.heat_deflection_temp_c or material.properties.max_service_temp_c
        thermal_guidance = AnalysisThermalGuidance(
            max_service_temp_c=material.properties.max_service_temp_c,
            heat_deflection_temp_c=material.properties.heat_deflection_temp_c,
            guidance=(
                "Seed material temperature guidance is present but not a thermal simulation. "
                "Use a sourced datasheet and thermal load case before heat-sensitive release decisions."
                if heat_limit is not None
                else "Temperature limit is missing and must be reviewed from a material datasheet."
            ),
            confidence=material.confidence,
            review_required=True,
        )
    else:
        material_properties = None
        thermal_guidance = AnalysisThermalGuidance(
            guidance="Material selection is missing, so thermal limits cannot be screened yet.",
            confidence=RecommendationConfidence.unknown,
        )

    blocking_inputs_missing = any(
        message.startswith(("No source CAD", "No material", "Geometry dimensions", "No load-bearing"))
        for message in review_required
    )
    state = AnalysisReadinessState.blocked_missing_inputs if blocking_inputs_missing else AnalysisReadinessState.pre_solver_ready
    summary = (
        "Pre-solver ready: explicit loads, constraints, material properties, and expected solver artifacts are recorded. "
        "This is not a real FEA result."
        if state is AnalysisReadinessState.pre_solver_ready
        else "Review required before meshing or solving: one or more required analysis inputs are missing. No FEA was run."
    )
    demo_estimates = []
    if demo_capacity_lb is not None:
        demo_estimates.append(
            f"Demo estimate only: seeded capacity {demo_capacity_lb:g} lb. This must be replaced by solver and test evidence."
        )
    if demo_note:
        demo_estimates.append(demo_note)

    criteria = [
        "Load path: tie the active task load to named CAD faces, fasteners, bearings, or contact pads.",
        "Stiffness: use elastic modulus as material input only; real displacement must come from a solver or test.",
        "Thermal: use heat-deflection or service temperature as a screening limit, not a thermal result.",
        "Manufacturing: process, grain direction, print orientation, and fastener preload remain review-required.",
    ]

    return AnalysisReadinessPreview(
        project_id=project.id,
        target_id=target_id,
        target_name=target_name,
        target_kind=target_kind,
        state=state,
        trust_label=AnalysisResultTrust.pre_solver_input,
        summary=summary,
        criteria=criteria,
        load_cases=load_cases,
        constraints=constraints,
        material_properties=material_properties,
        thermal_guidance=thermal_guidance,
        solver_inputs=SolverInputSpec(
            geometry_source=source_file,
            mesh_size_mm=DEFAULT_SOLVER_MESH_SIZE_MM if dimensions_ready else None,
            freecad_document="future FreeCAD document or STEP import path",
            gmsh_model="future Gmsh .geo or API-generated mesh model",
            calculix_input_deck="future CalculiX .inp deck",
            notes=["Units and coordinate frames must be normalized by the worker before solve."],
        ),
        expected_result_artifacts=_analysis_expected_artifacts(),
        solver_pipeline=_analysis_solver_pipeline(),
        demo_estimates=demo_estimates,
        review_required=review_required,
        recommended_job_request=AnalysisJobRequest(
            job_type=AnalysisJobType.run_fea,
            target_id=target_id,
            project_id=project.id,
            input_summary={
                "readiness_state": state.value,
                "load_case_ids": [load_case.id for load_case in load_cases],
                "constraint_ids": [constraint.id for constraint in constraints],
                "message": "Create a solver job only after review-required inputs are resolved.",
            },
        ),
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
    previews = [
        build_analysis_readiness_preview(project, part.id)
        for assembly in project.assemblies
        for part in assembly.parts
    ]
    return ProjectPanelData(
        project=project,
        task_requirements=collect_project_task_requirements(project),
        bom_items=collect_project_bom_items(project),
        manufacturing_options=collect_project_manufacturing_options(project),
        wiring_routes=collect_project_wiring_routes(project),
        reports=project.reports,
        analysis_readiness_previews=previews,
    )
