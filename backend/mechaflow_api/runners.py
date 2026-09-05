"""Local analysis job runners for demo-safe pre-solver behavior.

The runners in this module deliberately stop before real CAD, mesh, or solver
execution. They turn readiness previews into persisted artifacts so the desktop
MVP can exercise an end-to-end job flow without claiming certified FEA.
"""

from __future__ import annotations

import math
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol
from uuid import uuid4

from .models import (
    AnalysisArtifact,
    AnalysisArtifactKind,
    AnalysisJob,
    AnalysisJobStatus,
    AnalysisJobType,
    AnalysisLoadType,
    AnalysisReadinessPreview,
    LocalSolverToolAvailability,
    LocalSolverToolReviewStatus,
    LocalSolverToolStatus,
    Part,
    Project,
    RecommendationConfidence,
)
from .services import build_analysis_readiness_preview


LOCAL_PRE_SOLVER_RUNNER_NAME = "local-pre-solver-runner"


@dataclass(frozen=True)
class CommandBoundaryAdapter:
    """A future CLI boundary that the local runner can inspect without invoking."""

    adapter_name: str
    open_source_tool: str
    role: str
    binary_candidates: tuple[str, ...]

    def status(self) -> LocalSolverToolStatus:
        resolved = None
        for candidate in self.binary_candidates:
            candidate_path = shutil.which(candidate)
            if candidate_path:
                resolved = candidate_path
                break
        if resolved is None:
            return LocalSolverToolStatus(
                adapter_name=self.adapter_name,
                open_source_tool=self.open_source_tool,
                role=self.role,
                binary_candidates=list(self.binary_candidates),
                availability=LocalSolverToolAvailability.unavailable,
                review_status=LocalSolverToolReviewStatus.unavailable_review_required,
                message=(
                    f"{self.open_source_tool} command was not found locally. "
                    "Pre-solver artifact was produced, but real geometry, mesh, or solve output is unavailable."
                ),
            )
        return LocalSolverToolStatus(
            adapter_name=self.adapter_name,
            open_source_tool=self.open_source_tool,
            role=self.role,
            binary_candidates=list(self.binary_candidates),
            resolved_command=resolved,
            availability=LocalSolverToolAvailability.available,
            review_status=LocalSolverToolReviewStatus.available_not_invoked,
            message=(
                f"{self.open_source_tool} command is available at {resolved}, "
                "but the demo-safe runner did not invoke it. A future worker must run and attach solver "
                "provenance before any result is treated as FEA."
            ),
        )


COMMAND_BOUNDARIES: tuple[CommandBoundaryAdapter, ...] = (
    CommandBoundaryAdapter(
        adapter_name="freecad-fea-prep-worker",
        open_source_tool="FreeCAD",
        role="Prepare source CAD into analysis geometry, named regions, materials, and normalized units.",
        binary_candidates=("freecadcmd", "freecad", "FreeCAD"),
    ),
    CommandBoundaryAdapter(
        adapter_name="gmsh-meshing-worker",
        open_source_tool="Gmsh",
        role="Generate finite-element mesh and mesh-quality metadata from prepared geometry.",
        binary_candidates=("gmsh",),
    ),
    CommandBoundaryAdapter(
        adapter_name="calculix-fea-worker",
        open_source_tool="CalculiX",
        role="Run static structural solve and emit logs, result files, and a review report.",
        binary_candidates=("ccx", "calculix"),
    ),
)


class LocalAnalysisJobRunner(Protocol):
    """Executes a local analysis job against a project snapshot."""

    name: str

    def supports(self, job: AnalysisJob) -> bool: ...

    def run(self, project: Project, job: AnalysisJob) -> AnalysisJob: ...


def list_local_solver_tool_statuses() -> list[LocalSolverToolStatus]:
    """Return future solver command availability without invoking tools."""

    return [boundary.status() for boundary in COMMAND_BOUNDARIES]


def _find_target_parts(project: Project, target_id: str) -> list[Part]:
    target_part = next(
        (part for assembly in project.assemblies for part in assembly.parts if part.id == target_id),
        None,
    )
    if target_part is not None:
        return [target_part]
    target_assembly = next((assembly for assembly in project.assemblies if assembly.id == target_id), None)
    if target_assembly is not None:
        return list(target_assembly.parts)
    return []


def _force_newtons(readiness: AnalysisReadinessPreview) -> float | None:
    force_load = next((load for load in readiness.load_cases if load.load_type == AnalysisLoadType.force), None)
    if force_load is None or force_load.magnitude is None or not math.isfinite(force_load.magnitude):
        return None
    unit = (force_load.unit or "").strip().lower()
    if unit in {"lb", "lbf", "pound", "pounds"}:
        return force_load.magnitude * 4.4482216152605
    if unit in {"n", "newton", "newtons"}:
        return force_load.magnitude
    return None


def _minimum_section_area_mm2(parts: list[Part]) -> float | None:
    areas: list[float] = []
    for part in parts:
        dimensions = part.dimensions
        candidate_pairs = [
            (dimensions.width_mm, dimensions.thickness_mm),
            (dimensions.height_mm, dimensions.thickness_mm),
            (dimensions.width_mm, dimensions.height_mm),
        ]
        for first, second in candidate_pairs:
            if first is None or second is None:
                continue
            area = first * second
            if math.isfinite(area) and area > 0:
                areas.append(area)
    return min(areas) if areas else None


def _demo_screening_estimates(project: Project, readiness: AnalysisReadinessPreview) -> dict[str, object]:
    parts = _find_target_parts(project, readiness.target_id)
    force_n = _force_newtons(readiness)
    area_mm2 = _minimum_section_area_mm2(parts)
    yield_mpa = (
        readiness.material_properties.properties.yield_strength_mpa
        if readiness.material_properties is not None
        else None
    )
    nominal_stress_mpa = force_n / area_mm2 if force_n is not None and area_mm2 is not None else None
    nominal_yield_margin = yield_mpa / nominal_stress_mpa if yield_mpa is not None and nominal_stress_mpa else None
    return {
        "method": "demo_pre_solver_section_screen_v1",
        "disclaimer": (
            "This is a deterministic screening estimate from readiness inputs only. It is not FEA, "
            "does not use a mesh, and must not be used as certified engineering evidence."
        ),
        "input_force_n": round(force_n, 3) if force_n is not None else None,
        "minimum_section_area_mm2": round(area_mm2, 3) if area_mm2 is not None else None,
        "nominal_section_stress_mpa_demo": round(nominal_stress_mpa, 6) if nominal_stress_mpa is not None else None,
        "material_yield_strength_mpa": yield_mpa,
        "nominal_yield_margin_demo": round(nominal_yield_margin, 3) if nominal_yield_margin is not None else None,
        "review_required": [
            "Verify load direction, contact region, and fixtures in CAD before solving.",
            "Replace this nominal section estimate with mesh, boundary-condition, solver-log, and test evidence.",
            *readiness.review_required,
        ],
    }


class PreSolverScreeningRunner:
    """Turns readiness contracts into persisted pre-solver job artifacts."""

    name = LOCAL_PRE_SOLVER_RUNNER_NAME

    def supports(self, job: AnalysisJob) -> bool:
        return job.job_type in {AnalysisJobType.run_fea, AnalysisJobType.quick_load_heuristic}

    def run(self, project: Project, job: AnalysisJob) -> AnalysisJob:
        now = datetime.now(timezone.utc)
        if not self.supports(job):
            return job.model_copy(
                update={
                    "status": AnalysisJobStatus.failed,
                    "result_summary": {
                        **job.result_summary,
                        "message": f"{self.name} cannot run {job.job_type.value} jobs.",
                    },
                    "updated_at": now,
                }
            )

        readiness = build_analysis_readiness_preview(project, job.target_id, include_demo_estimates=True)
        tool_statuses = list_local_solver_tool_statuses()
        unavailable_tools = [
            status.open_source_tool
            for status in tool_statuses
            if status.availability == LocalSolverToolAvailability.unavailable
        ]
        estimates = _demo_screening_estimates(project, readiness)
        artifact = AnalysisArtifact(
            id=f"artifact-{uuid4()}",
            job_id=job.id,
            kind=(
                AnalysisArtifactKind.fea_summary
                if job.job_type == AnalysisJobType.run_fea
                else AnalysisArtifactKind.load_heuristic
            ),
            title="Local pre-solver screening package, not FEA",
            summary=(
                "Readiness inputs were packaged and demo screening estimates were calculated. "
                "No FreeCAD geometry prep, Gmsh mesh, or CalculiX solve was run."
            ),
            payload={
                "artifact_contract": "local_pre_solver_screening_v1",
                "trust_label": "demo_pre_solver_not_fea",
                "provenance": "Generated locally by Python from project readiness contracts.",
                "readiness_state": readiness.state.value,
                "readiness_summary": readiness.summary,
                "target": {
                    "project_id": project.id,
                    "target_id": readiness.target_id,
                    "target_name": readiness.target_name,
                    "target_kind": readiness.target_kind,
                },
                "load_cases": [load.model_dump(mode="json") for load in readiness.load_cases],
                "constraints": [constraint.model_dump(mode="json") for constraint in readiness.constraints],
                "material_properties": (
                    readiness.material_properties.model_dump(mode="json")
                    if readiness.material_properties is not None
                    else None
                ),
                "solver_inputs": readiness.solver_inputs.model_dump(mode="json"),
                "demo_screening_estimates": estimates,
                "tool_boundaries": [status.model_dump(mode="json") for status in tool_statuses],
                "future_solver_artifacts": [
                    expected_artifact.model_dump(mode="json")
                    for expected_artifact in readiness.expected_result_artifacts
                ],
                "result_label": "review_required_not_fea",
            },
            confidence=RecommendationConfidence.heuristic,
            generated_by=self.name,
            created_at=now,
        )
        message = (
            "Local pre-solver screening completed. This is not a real FEA result; review remains required."
            if not unavailable_tools
            else (
                "Local pre-solver screening completed with real solver tools unavailable: "
                f"{', '.join(unavailable_tools)}. Review required before solve."
            )
        )
        return job.model_copy(
            update={
                "status": AnalysisJobStatus.completed,
                "artifacts": [*job.artifacts, artifact],
                "result_summary": {
                    **job.result_summary,
                    "message": message,
                    "progress": 100,
                    "runner": self.name,
                    "trust_label": "demo_pre_solver_not_fea",
                    "review_status": "review_required",
                    "readiness_state": readiness.state.value,
                    "artifact_id": artifact.id,
                    "artifact_kind": artifact.kind.value,
                    "unavailable_solver_tools": unavailable_tools,
                },
                "updated_at": now,
            },
            deep=True,
        )


PRE_SOLVER_SCREENING_RUNNER = PreSolverScreeningRunner()
