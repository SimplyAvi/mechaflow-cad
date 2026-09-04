"""Local storage boundaries for the MechaFlow CAD API.

The first backend MVP keeps project data in memory while exposing a repository
contract that can later be backed by SQLite for local mode or PostgreSQL for
hosted deployments.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from datetime import datetime, timezone
from threading import RLock
from typing import Protocol

from .adapters import artifact_kind_for_job, get_adapter_for_job
from .catalog import DEFAULT_ASSEMBLY, DEFAULT_MATERIALS, DEFAULT_REFERENCE_DESIGNS, GRIPPER_TASK
from .models import (
    AnalysisArtifact,
    AnalysisArtifactKind,
    AnalysisJob,
    AnalysisJobStatus,
    AnalysisJobType,
    AnalysisReport,
    Project,
    ReportStatus,
    validate_project_id,
)


SEED_TIMESTAMP = datetime(2026, 9, 3, tzinfo=timezone.utc)


class ProjectStore(Protocol):
    def list_projects(self) -> list[Project]: ...

    def get_project(self, project_id: str) -> Project | None: ...

    def create_project(self, project: Project) -> Project: ...

    def upsert_project(self, project_id: str, project: Project) -> Project: ...

    def update_project(self, project_id: str, update: Callable[[Project], Project]) -> Project | None: ...

    def list_analysis_jobs(self, project_id: str | None = None) -> list[AnalysisJob]: ...

    def get_analysis_job(self, job_id: str) -> AnalysisJob | None: ...

    def add_analysis_job(self, job: AnalysisJob) -> AnalysisJob: ...

    def update_analysis_job(
        self,
        job_id: str,
        update: Callable[[AnalysisJob], AnalysisJob],
    ) -> AnalysisJob | None: ...


class ProjectAlreadyExistsError(ValueError):
    """Raised when a project create request reuses an existing id."""


class AnalysisJobAlreadyExistsError(ValueError):
    """Raised when an analysis job id has more than one project owner."""


class ProjectNotFoundError(ValueError):
    """Raised when a project-owned mutation targets a missing project."""


class InvalidAnalysisJobAdapterError(ValueError):
    """Raised when a persisted analysis job names an unsupported adapter."""


class InvalidAnalysisJobArtifactError(ValueError):
    """Raised when a persisted analysis artifact does not match its job type."""


class InvalidWiringEndpointError(ValueError):
    """Raised when a wiring endpoint names a part outside the project."""


class NonFiniteStorageValueError(ValueError):
    """Raised when persisted state contains a non-finite JSON number."""


def _ensure_json_finite(value: object, path: str) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise NonFiniteStorageValueError(f"{path} must contain only finite numbers")
    if isinstance(value, dict):
        for key, item in value.items():
            _ensure_json_finite(item, f"{path}.{key}")
    elif isinstance(value, (list, tuple)):
        for index, item in enumerate(value):
            _ensure_json_finite(item, f"{path}[{index}]")


def normalize_analysis_job(project_id: str, job: AnalysisJob, job_id: str | None = None) -> AnalysisJob:
    _ensure_json_finite(job.model_dump(mode="python"), "analysis_job")
    if get_adapter_for_job(job) is None:
        raise InvalidAnalysisJobAdapterError(
            f"adapter {job.adapter_name!r} does not support analysis job type {job.job_type.value!r}"
        )
    expected_artifact_kind = artifact_kind_for_job(job.job_type)
    for artifact in job.artifacts:
        if artifact.kind != expected_artifact_kind:
            raise InvalidAnalysisJobArtifactError(
                f"analysis job type {job.job_type.value!r} requires artifact kind {expected_artifact_kind.value!r}, "
                f"not {artifact.kind.value!r}"
            )
    normalized_job_id = job.id if job_id is None else job_id
    artifacts = [artifact.model_copy(update={"job_id": normalized_job_id}, deep=True) for artifact in job.artifacts]
    return job.model_copy(
        update={"id": normalized_job_id, "project_id": project_id, "artifacts": artifacts},
        deep=True,
    )


def normalize_project_references(project_id: str, project: Project) -> Project:
    project_id = validate_project_id(project_id)
    _ensure_json_finite(project.model_dump(mode="python"), "project")
    part_ids = {part.id for assembly in project.assemblies for part in assembly.parts}
    route_ids_by_part: dict[str, list[str]] = {}
    for assembly in project.assemblies:
        for route in assembly.wiring_routes:
            for connector in (route.from_connector, route.to_connector):
                if connector.part_id is not None:
                    if connector.part_id not in part_ids:
                        raise InvalidWiringEndpointError(
                            f"wiring route {route.id!r} references unknown part {connector.part_id!r}"
                        )
                    route_ids = route_ids_by_part.setdefault(connector.part_id, [])
                    if route.id not in route_ids:
                        route_ids.append(route.id)
    assemblies = [
        assembly.model_copy(
            update={
                "parts": [
                    part.model_copy(update={"wiring_route_ids": route_ids_by_part.get(part.id, [])}, deep=True)
                    for part in assembly.parts
                ]
            },
            deep=True,
        )
        for assembly in project.assemblies
    ]
    analysis_jobs = [normalize_analysis_job(project_id, job) for job in project.analysis_jobs]
    reports = [report.model_copy(update={"project_id": project_id}, deep=True) for report in project.reports]
    return project.model_copy(
        update={"id": project_id, "assemblies": assemblies, "analysis_jobs": analysis_jobs, "reports": reports},
        deep=True,
    )


class InMemoryProjectStore:
    def __init__(self, seed_projects: list[Project] | None = None) -> None:
        self._lock = RLock()
        self._projects: dict[str, Project] = {}
        for project in seed_projects or []:
            self.create_project(project)

    def _ensure_job_ids_available(self, project_id: str, project: Project) -> None:
        incoming_ids: set[str] = set()
        for job in project.analysis_jobs:
            if job.id in incoming_ids:
                raise AnalysisJobAlreadyExistsError(job.id)
            incoming_ids.add(job.id)
        for existing_project_id, existing_project in self._projects.items():
            if existing_project_id == project_id:
                continue
            existing_ids = {job.id for job in existing_project.analysis_jobs}
            conflict = incoming_ids & existing_ids
            if conflict:
                raise AnalysisJobAlreadyExistsError(next(iter(conflict)))

    def _analysis_job_exists(self, job_id: str) -> bool:
        return any(job.id == job_id for project in self._projects.values() for job in project.analysis_jobs)

    def list_projects(self) -> list[Project]:
        with self._lock:
            return [project.model_copy(deep=True) for project in self._projects.values()]

    def get_project(self, project_id: str) -> Project | None:
        with self._lock:
            project = self._projects.get(project_id)
            return project.model_copy(deep=True) if project else None

    def create_project(self, project: Project) -> Project:
        with self._lock:
            if project.id in self._projects:
                raise ProjectAlreadyExistsError(project.id)
            self._ensure_job_ids_available(project.id, project)
            stored = normalize_project_references(project.id, project)
            self._projects[project.id] = stored
            return stored.model_copy(deep=True)

    def upsert_project(self, project_id: str, project: Project) -> Project:
        with self._lock:
            self._ensure_job_ids_available(project_id, project)
            stored = normalize_project_references(project_id, project)
            self._projects[project_id] = stored
            return stored.model_copy(deep=True)

    def update_project(self, project_id: str, update: Callable[[Project], Project]) -> Project | None:
        with self._lock:
            project = self._projects.get(project_id)
            if project is None:
                return None
            updated = update(project.model_copy(deep=True))
            self._ensure_job_ids_available(project_id, updated)
            stored = normalize_project_references(project_id, updated)
            self._projects[project_id] = stored
            return stored.model_copy(deep=True)

    def list_analysis_jobs(self, project_id: str | None = None) -> list[AnalysisJob]:
        with self._lock:
            jobs: list[AnalysisJob] = []
            for project in self._projects.values():
                jobs.extend(project.analysis_jobs)
            if project_id is not None:
                jobs = [job for job in jobs if job.project_id == project_id]
            return [job.model_copy(deep=True) for job in jobs]

    def get_analysis_job(self, job_id: str) -> AnalysisJob | None:
        with self._lock:
            for project in self._projects.values():
                for job in project.analysis_jobs:
                    if job.id == job_id:
                        return job.model_copy(deep=True)
            return None

    def add_analysis_job(self, job: AnalysisJob) -> AnalysisJob:
        with self._lock:
            if self._analysis_job_exists(job.id):
                raise AnalysisJobAlreadyExistsError(job.id)
            project = self._projects.get(job.project_id)
            if project is None:
                raise ProjectNotFoundError(job.project_id)
            stored = normalize_analysis_job(project.id, job)
            self._projects[project.id] = project.model_copy(
                update={"analysis_jobs": [*project.analysis_jobs, stored]},
                deep=True,
            )
            return stored.model_copy(deep=True)

    def update_analysis_job(
        self,
        job_id: str,
        update: Callable[[AnalysisJob], AnalysisJob],
    ) -> AnalysisJob | None:
        with self._lock:
            for project_id, project in self._projects.items():
                for index, job in enumerate(project.analysis_jobs):
                    if job.id != job_id:
                        continue
                    stored = normalize_analysis_job(project_id, update(job.model_copy(deep=True)), job_id)
                    jobs = list(project.analysis_jobs)
                    jobs[index] = stored
                    self._projects[project_id] = project.model_copy(update={"analysis_jobs": jobs}, deep=True)
                    return stored.model_copy(deep=True)
            return None


def build_sample_analysis_jobs() -> list[AnalysisJob]:
    job_data = [
        {
            "id": "job-import-design",
            "job_type": AnalysisJobType.import_design,
            "status": AnalysisJobStatus.completed,
            "target_id": "ref-open-gripper-demo",
            "adapter_name": "freecad-worker",
            "input_summary": {"files": ["gripper.step", "gripper.FCStd"]},
            "result_summary": {
                "message": "STEP assembly imported and metadata normalized for selectable parts.",
                "progress": 100,
            },
            "artifacts": [
                AnalysisArtifact(
                    id="artifact-cad-metadata",
                    job_id="job-import-design",
                    kind=AnalysisArtifactKind.cad_metadata,
                    title="Starter CAD metadata",
                    summary="Selectable part and assembly metadata normalized from the starter design.",
                    generated_by="freecad-worker",
                    created_at=SEED_TIMESTAMP,
                )
            ],
        },
        {
            "id": "job-exploded-view",
            "job_type": AnalysisJobType.generate_exploded_view,
            "status": AnalysisJobStatus.completed,
            "target_id": "asm-open-gripper-demo",
            "adapter_name": "freecad-worker",
            "input_summary": {"assembly": "asm-open-gripper-demo"},
            "result_summary": {
                "message": "Exploded transforms are available for concept animation.",
                "progress": 100,
            },
            "artifacts": [
                AnalysisArtifact(
                    id="artifact-exploded-view",
                    job_id="job-exploded-view",
                    kind=AnalysisArtifactKind.exploded_view,
                    title="Exploded view transform set",
                    summary="Concept transforms are ready for the local cockpit animation.",
                    generated_by="freecad-worker",
                    created_at=SEED_TIMESTAMP,
                )
            ],
        },
        {
            "id": "job-rerate-payload",
            "job_type": AnalysisJobType.rerate_payload_capability,
            "status": AnalysisJobStatus.running,
            "target_id": "part-finger-link",
            "adapter_name": "calculix-fea-worker",
            "input_summary": {"task": "task-lift-50lb"},
            "result_summary": {
                "message": "Quick load heuristic is estimating payload after the active material choice.",
                "progress": 66,
            },
        },
        {
            "id": "job-wire-clearance",
            "job_type": AnalysisJobType.check_wire_routing,
            "status": AnalysisJobStatus.queued,
            "target_id": "route-finger-sensor",
            "adapter_name": "wireviz-harness-worker",
            "input_summary": {"route": "route-finger-sensor"},
            "result_summary": {
                "message": "Wiring route check is queued behind CAD geometry extraction.",
                "progress": 18,
            },
        },
        {
            "id": "job-manufacturing-report",
            "job_type": AnalysisJobType.generate_manufacturing_report,
            "status": AnalysisJobStatus.queued,
            "target_id": "project-open-gripper-demo",
            "adapter_name": "supplier-options-worker",
            "input_summary": {"selected_part_ids": ["part-finger-link"]},
            "result_summary": {
                "message": "Supplier and fabrication estimates are ready for a low-cost worker handoff.",
                "progress": 28,
            },
        },
    ]
    return [
        AnalysisJob(
            **item,
            project_id="project-open-gripper-demo",
            created_at=SEED_TIMESTAMP,
            updated_at=SEED_TIMESTAMP,
        )
        for item in job_data
    ]


def build_sample_reports() -> list[AnalysisReport]:
    return [
        AnalysisReport(
            id="report-local-material-preview",
            project_id="project-open-gripper-demo",
            title="Advisory material preview report",
            status=ReportStatus.requires_review,
            summary=(
                "Local project data can preview material substitutions, but payload, fatigue, wiring, and "
                "manufacturability stay advisory until worker adapters run."
            ),
            task_results=[
                {
                    "task_kind": "lift_payload",
                    "status": "requires_review",
                    "method": "local_schema_update_only",
                }
            ],
            manufacturing_impacts=["Preferred manufacturing process can be attached to the part metadata."],
            wiring_impacts=["Target part has wiring routes; clearance and bend radius need a worker check."],
            risks=[
                "Local edit preview does not modify CAD geometry yet.",
                "Strength and fatigue changes are not authoritative.",
            ],
            unknowns=["Updated mass properties are unknown until a CAD worker recalculates them."],
            recommendations=["Queue mass properties and payload re-rating before manufacturing."],
            assumptions=["Part-level schema update is enough for frontend edit flow prototyping."],
            generated_at=SEED_TIMESTAMP,
        )
    ]


def build_sample_project() -> Project:
    return Project(
        id="project-open-gripper-demo",
        name="Open gripper task-preserving edit demo",
        description="Local seed project for frontend integration before persistence is added.",
        reference_design_id=DEFAULT_REFERENCE_DESIGNS[0].id,
        active_task=GRIPPER_TASK,
        assemblies=[DEFAULT_ASSEMBLY],
        materials=DEFAULT_MATERIALS,
        analysis_jobs=build_sample_analysis_jobs(),
        reports=build_sample_reports(),
        created_at=SEED_TIMESTAMP,
        updated_at=SEED_TIMESTAMP,
    )


def build_default_project_store() -> InMemoryProjectStore:
    return InMemoryProjectStore(seed_projects=[build_sample_project()])
