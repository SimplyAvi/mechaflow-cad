"""FastAPI application for MechaFlow CAD."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .adapters import choose_adapter, get_adapter_for_job, list_adapter_statuses
from .catalog import DEFAULT_ASSEMBLY, DEFAULT_MATERIALS, DEFAULT_REFERENCE_DESIGNS
from .models import (
    AnalysisArtifact,
    AnalysisConstraint,
    AnalysisJob,
    AnalysisJobPlan,
    AnalysisJobRequest,
    AnalysisJobStatus,
    AnalysisJobType,
    AnalysisLoadCase,
    AnalysisReadinessPreview,
    AnalysisReadinessRequest,
    AnalysisReport,
    Assembly,
    BOMItem,
    CatalogSeedResponse,
    ExpectedAnalysisResultArtifact,
    LocalSolverToolStatus,
    ManufacturingOption,
    Material,
    Modification,
    Part,
    PartManufacturingOptions,
    Project,
    ProjectModificationResponse,
    ProjectPanelData,
    ReferenceDesign,
    SolverInputSpec,
    SolverPipelineStep,
    TaskRequirement,
    WiringRoute,
    validate_project_id,
)
from .runners import (
    LOCAL_PRE_SOLVER_RUNNER_NAME,
    PRE_SOLVER_SCREENING_RUNNER,
    list_local_solver_tool_statuses,
)
from .services import (
    InvalidDimensionChangeError,
    MaterialProcessCompatibilityError,
    MaterialNotFoundError,
    PartNotFoundError,
    apply_project_modification,
    build_analysis_readiness_preview,
    build_project_panel_data,
    collect_project_bom_items,
    collect_project_manufacturing_options,
    collect_project_task_requirements,
    collect_project_wiring_routes,
)
from .settings import Settings, get_settings
from .storage import (
    AnalysisJobAlreadyExistsError,
    InvalidAnalysisJobAdapterError,
    InvalidAnalysisJobArtifactError,
    InvalidPartMaterialError,
    InvalidWiringEndpointError,
    NonFiniteStorageValueError,
    ProjectAlreadyExistsError,
    ProjectNotFoundError,
    ProjectStore,
    build_default_project_store,
)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    environment: str
    local_mode: bool
    timestamp: datetime


class StatusResponse(BaseModel):
    status: str
    service: str
    adapters: list[dict]
    warnings: list[str]


class ApiMetadata(BaseModel):
    product: str
    version: str
    api_prefix: str
    concepts: list[str]
    advisory_notice: str
    local_development: dict[str, str]
    integration_stubs: list[dict]


class ConceptResponse(BaseModel):
    concepts: dict[str, str]


SCHEMA_MODELS = [
    Project,
    ReferenceDesign,
    Assembly,
    Part,
    Material,
    TaskRequirement,
    AnalysisJob,
    AnalysisJobPlan,
    AnalysisArtifact,
    ManufacturingOption,
    WiringRoute,
    AnalysisReport,
    AnalysisReadinessPreview,
    AnalysisReadinessRequest,
    AnalysisLoadCase,
    AnalysisConstraint,
    ExpectedAnalysisResultArtifact,
    SolverInputSpec,
    SolverPipelineStep,
    LocalSolverToolStatus,
    Modification,
    ProjectModificationResponse,
    CatalogSeedResponse,
    PartManufacturingOptions,
    ProjectPanelData,
    BOMItem,
]


CONCEPTS = {
    "projects": "Workspaces that keep an active task attached to an editable design.",
    "reference_designs": "Open design catalog entries with license, source, files, BOM, electronics, and known limitations.",
    "assemblies": "Parsed mechanical structures with parts, subassemblies, wiring routes, and exploded-view transforms.",
    "parts": "Selectable components with purpose, material, dimensions, mass, fasteners, and manufacturing options.",
    "materials": "Open or sourced material properties with confidence labels and manufacturing compatibility.",
    "task_requirements": "Task-preserving constraints such as payload, reach, cycle time, envelope, fatigue, and serviceability.",
    "analysis_jobs": "Queued orchestration work for FreeCAD, FEA, wiring, BOM, manufacturing, and report generation workers.",
    "analysis_readiness": "Pre-solver load cases, constraints, material provenance, thermal guidance, and expected FEA artifacts without claiming a solve.",
    "manufacturing_options": "Ways to make or buy a part, including cost range, lead time, supplier link, and risk notes.",
    "wiring_routes": "Connector-to-connector harness paths with bend-radius, clearance, and harness BOM metadata.",
    "reports": "Advisory summaries of task status, payload re-rating, cost, manufacturing, wiring, risks, and unknowns.",
}
CATALOG_SEED_PATH = Path(__file__).resolve().parents[2] / "catalog" / "reference-designs" / "reference-designs.seed.json"
CATALOG_TASKS_PATH = Path(__file__).resolve().parents[2] / "data" / "tasks.seed.json"


def create_app(settings: Settings | None = None, project_store: ProjectStore | None = None) -> FastAPI:
    settings = settings or get_settings()
    project_store = project_store or build_default_project_store()
    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        description=(
            "Open-source orchestration API for robotics CAD projects. "
            "Current analysis and integration responses are advisory stubs until workers are connected."
        ),
        openapi_url=f"{settings.api_prefix}/openapi.json",
        docs_url=f"{settings.api_prefix}/docs",
        redoc_url=f"{settings.api_prefix}/redoc",
    )

    allow_all_origins = settings.cors_origins == ("*",)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all_origins else list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def get_project_or_404(project_id: str) -> Project:
        stored_project = project_store.get_project(project_id)
        if stored_project is None:
            raise HTTPException(status_code=404, detail="project not found")
        return stored_project

    def get_analysis_job_or_404(job_id: str) -> AnalysisJob:
        job = project_store.get_analysis_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="analysis job not found")
        return job

    @app.get("/health", response_model=HealthResponse, tags=["platform"])
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service=settings.app_name,
            version=settings.version,
            environment=settings.environment,
            local_mode=settings.local_mode,
            timestamp=datetime.now(timezone.utc),
        )

    @app.get("/status", response_model=StatusResponse, tags=["platform"])
    def status() -> StatusResponse:
        adapters = list_adapter_statuses()
        warnings = [
            "Analysis outputs are advisory stubs until FreeCAD, CalculiX, KiCad, WireViz, and supplier workers are wired.",
            "Use MECHAFLOW_API_PORT to choose a local port; port 0 lets the OS pick an available port.",
        ]
        return StatusResponse(
            status="degraded" if any(adapter.status == "stub" for adapter in adapters) else "ok",
            service=settings.app_name,
            adapters=[adapter.model_dump(mode="json") for adapter in adapters],
            warnings=warnings,
        )

    @app.get(f"{settings.api_prefix}/metadata", response_model=ApiMetadata, tags=["metadata"])
    def metadata() -> ApiMetadata:
        return ApiMetadata(
            product="MechaFlow CAD",
            version=settings.version,
            api_prefix=settings.api_prefix,
            concepts=list(CONCEPTS.keys()),
            advisory_notice="Engineering checks are estimates until validated by qualified review and real analysis workers.",
            local_development={
                "api_host_env": "MECHAFLOW_API_HOST",
                "api_port_env": "MECHAFLOW_API_PORT",
                "frontend_port_env": "MECHAFLOW_FRONTEND_PORT",
                "find_free_port_command": "python scripts/find-free-port.py",
            },
            integration_stubs=[adapter.model_dump(mode="json") for adapter in list_adapter_statuses()],
        )

    @app.get(f"{settings.api_prefix}/concepts", response_model=ConceptResponse, tags=["metadata"])
    def concepts() -> ConceptResponse:
        return ConceptResponse(concepts=CONCEPTS)

    @app.get(f"{settings.api_prefix}/schemas", tags=["metadata"])
    def schemas() -> dict[str, dict]:
        return {model.__name__: model.model_json_schema() for model in SCHEMA_MODELS}

    @app.get(f"{settings.api_prefix}/integrations", tags=["metadata"])
    def integrations() -> list[dict]:
        return [adapter.model_dump(mode="json") for adapter in list_adapter_statuses()]

    @app.get(f"{settings.api_prefix}/catalog/seed", response_model=CatalogSeedResponse, tags=["catalog"])
    def catalog_seed() -> CatalogSeedResponse:
        sample = project_store.get_project("project-open-gripper-demo")
        if sample is None:
            raise HTTPException(status_code=404, detail="sample project not found")
        return CatalogSeedResponse(
            reference_designs=DEFAULT_REFERENCE_DESIGNS,
            materials=DEFAULT_MATERIALS,
            task_requirements=[task for design in DEFAULT_REFERENCE_DESIGNS for task in design.example_tasks],
            sample_project=sample,
        )

    @app.get(f"{settings.api_prefix}/reference-designs", response_model=list[ReferenceDesign], tags=["catalog"])
    def reference_designs() -> list[ReferenceDesign]:
        return DEFAULT_REFERENCE_DESIGNS

    @app.get(f"{settings.api_prefix}/catalog/reference-designs", tags=["catalog"])
    def catalog_reference_designs() -> dict[str, list[dict]]:
        with CATALOG_SEED_PATH.open("r", encoding="utf-8") as handle:
            return {"items": json.load(handle)}

    @app.get(f"{settings.api_prefix}/catalog/tasks", tags=["catalog"])
    def catalog_tasks() -> dict[str, list[dict]]:
        with CATALOG_TASKS_PATH.open("r", encoding="utf-8") as handle:
            return {"items": json.load(handle)}

    @app.get(f"{settings.api_prefix}/materials", response_model=list[Material], tags=["catalog"])
    def materials() -> list[Material]:
        return DEFAULT_MATERIALS

    @app.get(f"{settings.api_prefix}/task-requirements/sample", response_model=list[TaskRequirement], tags=["catalog"])
    def sample_task_requirements() -> list[TaskRequirement]:
        return [task for design in DEFAULT_REFERENCE_DESIGNS for task in design.example_tasks]

    @app.get(f"{settings.api_prefix}/assemblies/sample", response_model=Assembly, tags=["catalog"])
    def sample_assembly() -> Assembly:
        return DEFAULT_ASSEMBLY

    @app.get(f"{settings.api_prefix}/projects", response_model=list[Project], tags=["projects"])
    def projects() -> list[Project]:
        return project_store.list_projects()

    @app.get(f"{settings.api_prefix}/projects/sample", response_model=Project, tags=["projects"])
    def sample_project() -> Project:
        sample = project_store.get_project("project-open-gripper-demo")
        if sample is None:
            raise HTTPException(status_code=404, detail="sample project not found")
        return sample

    @app.get(f"{settings.api_prefix}/projects/{{project_id}}", response_model=Project, tags=["projects"])
    def project(project_id: str) -> Project:
        return get_project_or_404(project_id)

    @app.post(f"{settings.api_prefix}/projects", response_model=Project, status_code=201, tags=["projects"])
    def create_project(project: Project) -> Project:
        try:
            return project_store.create_project(project)
        except ProjectAlreadyExistsError as exc:
            raise HTTPException(status_code=409, detail="project already exists") from exc
        except AnalysisJobAlreadyExistsError as exc:
            raise HTTPException(status_code=409, detail="analysis job id already exists") from exc
        except (
            InvalidAnalysisJobAdapterError,
            InvalidAnalysisJobArtifactError,
            InvalidPartMaterialError,
            InvalidWiringEndpointError,
            NonFiniteStorageValueError,
        ) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.put(f"{settings.api_prefix}/projects/{{project_id}}", response_model=Project, tags=["projects"])
    def upsert_project(project_id: str, project: Project) -> Project:
        try:
            validate_project_id(project_id)
            return project_store.upsert_project(project_id, project)
        except AnalysisJobAlreadyExistsError as exc:
            raise HTTPException(status_code=409, detail="analysis job id already exists") from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get(f"{settings.api_prefix}/projects/{{project_id}}/panel-data", response_model=ProjectPanelData, tags=["projects"])
    def project_panel_data(project_id: str) -> ProjectPanelData:
        if project_id == "sample":
            project_id = "project-open-gripper-demo"
        return build_project_panel_data(get_project_or_404(project_id))

    @app.post(
        f"{settings.api_prefix}/projects/{{project_id}}/analysis-readiness/previews",
        response_model=AnalysisReadinessPreview,
        tags=["analysis-readiness"],
    )
    def create_analysis_readiness_preview(
        project_id: str,
        request: AnalysisReadinessRequest,
    ) -> AnalysisReadinessPreview:
        project = get_project_or_404("project-open-gripper-demo" if project_id == "sample" else project_id)
        try:
            return build_analysis_readiness_preview(
                project,
                request.target_id,
                include_demo_estimates=request.include_demo_estimates,
            )
        except PartNotFoundError as exc:
            raise HTTPException(status_code=404, detail="analysis target not found") from exc

    @app.get(
        f"{settings.api_prefix}/projects/{{project_id}}/analysis-readiness/{{target_id}}",
        response_model=AnalysisReadinessPreview,
        tags=["analysis-readiness"],
    )
    def analysis_readiness_preview(project_id: str, target_id: str) -> AnalysisReadinessPreview:
        project = get_project_or_404("project-open-gripper-demo" if project_id == "sample" else project_id)
        try:
            return build_analysis_readiness_preview(project, target_id)
        except PartNotFoundError as exc:
            raise HTTPException(status_code=404, detail="analysis target not found") from exc

    @app.get(
        f"{settings.api_prefix}/projects/{{project_id}}/task-requirements",
        response_model=list[TaskRequirement],
        tags=["projects"],
    )
    def project_task_requirements(project_id: str) -> list[TaskRequirement]:
        return collect_project_task_requirements(get_project_or_404(project_id))

    @app.get(f"{settings.api_prefix}/projects/{{project_id}}/bom", response_model=list[BOMItem], tags=["projects"])
    def project_bom(project_id: str) -> list[BOMItem]:
        return collect_project_bom_items(get_project_or_404(project_id))

    @app.get(
        f"{settings.api_prefix}/projects/{{project_id}}/manufacturing-options",
        response_model=list[PartManufacturingOptions],
        tags=["projects"],
    )
    def project_manufacturing_options(project_id: str) -> list[PartManufacturingOptions]:
        return collect_project_manufacturing_options(get_project_or_404(project_id))

    @app.get(
        f"{settings.api_prefix}/projects/{{project_id}}/wiring-routes",
        response_model=list[WiringRoute],
        tags=["projects"],
    )
    def project_wiring_routes(project_id: str) -> list[WiringRoute]:
        return collect_project_wiring_routes(get_project_or_404(project_id))

    @app.get(f"{settings.api_prefix}/projects/{{project_id}}/reports", response_model=list[AnalysisReport], tags=["projects"])
    def project_reports(project_id: str) -> list[AnalysisReport]:
        return get_project_or_404(project_id).reports

    @app.post(
        f"{settings.api_prefix}/projects/{{project_id}}/modifications",
        response_model=ProjectModificationResponse,
        tags=["projects"],
    )
    def modify_project(project_id: str, modification: Modification) -> ProjectModificationResponse:
        result: ProjectModificationResponse | None = None

        def apply_modification(stored_project: Project) -> Project:
            nonlocal result
            result = apply_project_modification(stored_project, modification)
            return result.project

        try:
            stored_project = project_store.update_project(project_id, apply_modification)
        except PartNotFoundError as exc:
            raise HTTPException(status_code=404, detail="target part not found") from exc
        except (MaterialNotFoundError, MaterialProcessCompatibilityError, InvalidDimensionChangeError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if stored_project is None or result is None:
            raise HTTPException(status_code=404, detail="project not found")
        return result.model_copy(update={"project": stored_project}, deep=True)

    @app.get(f"{settings.api_prefix}/analysis-jobs", response_model=list[AnalysisJob], tags=["jobs"])
    def analysis_jobs(project_id: str | None = None) -> list[AnalysisJob]:
        return project_store.list_analysis_jobs(project_id)

    @app.get(
        f"{settings.api_prefix}/local-analysis/tool-boundaries",
        response_model=list[LocalSolverToolStatus],
        tags=["jobs"],
    )
    def local_analysis_tool_boundaries() -> list[LocalSolverToolStatus]:
        return list_local_solver_tool_statuses()

    def add_queued_analysis_job(request: AnalysisJobRequest, adapter_name: str | None = None) -> AnalysisJob:
        adapter = choose_adapter(request) if adapter_name is None else None
        now = datetime.now(timezone.utc)
        plan = adapter.plan(request) if adapter else None
        resolved_adapter_name = adapter_name or (adapter.status.name if adapter else "unassigned")
        queue_name = (
            "pre-solver-local"
            if adapter_name == LOCAL_PRE_SOLVER_RUNNER_NAME
            else plan.queue_name if plan else None
        )
        expected_artifacts = (
            ["fea_summary" if request.job_type == AnalysisJobType.run_fea else "load_heuristic"]
            if adapter_name == LOCAL_PRE_SOLVER_RUNNER_NAME
            else [artifact.value for artifact in plan.expected_artifacts] if plan else []
        )
        while True:
            job = AnalysisJob(
                id=f"job-{uuid4()}",
                job_type=request.job_type,
                status=(
                    AnalysisJobStatus.queued
                    if resolved_adapter_name != "unassigned"
                    else AnalysisJobStatus.blocked_missing_adapter
                ),
                target_id=request.target_id,
                project_id=request.project_id,
                adapter_name=resolved_adapter_name,
                local_compute_preferred=request.local_compute_preferred,
                input_summary=request.input_summary,
                result_summary={
                    "message": "Job accepted as orchestration metadata only; no heavy CAD or simulation tool was invoked.",
                    "queue_name": queue_name,
                    "expected_artifacts": expected_artifacts,
                },
                created_at=now,
                updated_at=now,
            )
            try:
                return project_store.add_analysis_job(job)
            except AnalysisJobAlreadyExistsError:
                continue
            except ProjectNotFoundError as exc:
                raise HTTPException(status_code=404, detail="project not found") from exc
            except (InvalidAnalysisJobAdapterError, NonFiniteStorageValueError) as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post(f"{settings.api_prefix}/analysis-jobs", response_model=AnalysisJob, status_code=202, tags=["jobs"])
    def create_analysis_job(request: AnalysisJobRequest) -> AnalysisJob:
        return add_queued_analysis_job(request)

    @app.get(f"{settings.api_prefix}/analysis-jobs/{{job_id}}", response_model=AnalysisJob, tags=["jobs"])
    def analysis_job(job_id: str) -> AnalysisJob:
        return get_analysis_job_or_404(job_id)

    @app.get(f"{settings.api_prefix}/analysis-jobs/{{job_id}}/plan", response_model=AnalysisJobPlan, tags=["jobs"])
    def analysis_job_plan(job_id: str) -> AnalysisJobPlan:
        job = get_analysis_job_or_404(job_id)
        request = AnalysisJobRequest(
            job_type=job.job_type,
            target_id=job.target_id,
            project_id=job.project_id,
            local_compute_preferred=job.local_compute_preferred,
            input_summary=job.input_summary,
        )
        adapter = get_adapter_for_job(job)
        if adapter is None:
            raise HTTPException(status_code=409, detail="analysis job has no matching adapter")
        return adapter.plan(request)

    def run_local_pre_solver_job(job_id: str) -> AnalysisJob:
        def mark_running(job: AnalysisJob) -> AnalysisJob:
            return job.model_copy(
                update={"status": AnalysisJobStatus.running, "updated_at": datetime.now(timezone.utc)},
                deep=True,
            )

        running_job = project_store.update_analysis_job(job_id, mark_running)
        if running_job is None:
            raise HTTPException(status_code=404, detail="analysis job not found")
        project = get_project_or_404(running_job.project_id)
        try:
            completed_job = PRE_SOLVER_SCREENING_RUNNER.run(project, running_job)
        except PartNotFoundError as exc:
            def mark_failed(job: AnalysisJob) -> AnalysisJob:
                return job.model_copy(
                    update={
                        "status": AnalysisJobStatus.failed,
                        "result_summary": {**job.result_summary, "message": "analysis target not found"},
                        "updated_at": datetime.now(timezone.utc),
                    },
                    deep=True,
                )

            project_store.update_analysis_job(job_id, mark_failed)
            raise HTTPException(status_code=404, detail="analysis target not found") from exc
        stored_job = project_store.update_analysis_job(job_id, lambda _: completed_job)
        if stored_job is None:
            raise HTTPException(status_code=404, detail="analysis job not found")
        return stored_job

    @app.post(
        f"{settings.api_prefix}/projects/{{project_id}}/analysis-jobs/pre-solver-runs",
        response_model=AnalysisJob,
        status_code=202,
        tags=["jobs"],
    )
    def create_project_pre_solver_run(project_id: str, request: AnalysisReadinessRequest) -> AnalysisJob:
        if project_id == "sample":
            project_id = "project-open-gripper-demo"
        project = get_project_or_404(project_id)
        if request.job_type not in {AnalysisJobType.run_fea, AnalysisJobType.quick_load_heuristic}:
            raise HTTPException(
                status_code=422,
                detail="pre-solver runner supports run_fea and quick_load_heuristic jobs",
            )
        try:
            readiness = build_analysis_readiness_preview(
                project,
                request.target_id,
                include_demo_estimates=request.include_demo_estimates,
            )
        except PartNotFoundError as exc:
            raise HTTPException(status_code=404, detail="analysis target not found") from exc
        job = add_queued_analysis_job(
            AnalysisJobRequest(
                job_type=request.job_type,
                target_id=request.target_id,
                project_id=project_id,
                local_compute_preferred=True,
                input_summary={
                    "readiness_state": readiness.state.value,
                    "load_case_ids": [load_case.id for load_case in readiness.load_cases],
                    "constraint_ids": [constraint.id for constraint in readiness.constraints],
                    "source": "project pre-solver run endpoint",
                },
            ),
            adapter_name=LOCAL_PRE_SOLVER_RUNNER_NAME,
        )
        return run_local_pre_solver_job(job.id)

    @app.post(f"{settings.api_prefix}/analysis-jobs/{{job_id}}/run-local", response_model=AnalysisJob, tags=["jobs"])
    def run_analysis_job_local(job_id: str) -> AnalysisJob:
        return run_local_pre_solver_job(job_id)

    @app.post(f"{settings.api_prefix}/analysis-jobs/{{job_id}}/run-stub", response_model=AnalysisJob, tags=["jobs"])
    def run_analysis_job_stub(job_id: str) -> AnalysisJob:
        def run_stub(job: AnalysisJob) -> AnalysisJob:
            adapter = get_adapter_for_job(job)
            now = datetime.now(timezone.utc)
            if adapter is None:
                return job.model_copy(update={"status": AnalysisJobStatus.blocked_missing_adapter, "updated_at": now})
            artifact = adapter.run_stub(job)
            return job.model_copy(
                update={
                    "status": AnalysisJobStatus.completed,
                    "artifacts": [*job.artifacts, artifact],
                    "result_summary": {
                        **job.result_summary,
                        "message": "Local stub completed without invoking heavy tools.",
                        "artifact_id": artifact.id,
                        "artifact_kind": artifact.kind.value,
                    },
                    "updated_at": now,
                }
            )

        job = project_store.update_analysis_job(job_id, run_stub)
        if job is None:
            raise HTTPException(status_code=404, detail="analysis job not found")
        return job

    return app


app = create_app()
