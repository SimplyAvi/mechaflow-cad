"""FastAPI application for MechaFlow CAD."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .adapters import choose_adapter, list_adapter_statuses
from .catalog import DEFAULT_ASSEMBLY, DEFAULT_MATERIALS, DEFAULT_REFERENCE_DESIGNS, GRIPPER_TASK
from .models import (
    AnalysisJob,
    AnalysisJobRequest,
    AnalysisJobStatus,
    AnalysisReport,
    Assembly,
    ManufacturingOption,
    Material,
    Part,
    Project,
    ReferenceDesign,
    TaskRequirement,
    WiringRoute,
)
from .settings import Settings, get_settings


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
    ManufacturingOption,
    WiringRoute,
    AnalysisReport,
]


CONCEPTS = {
    "projects": "Workspaces that keep an active task attached to an editable design.",
    "reference_designs": "Open design catalog entries with license, source, files, BOM, electronics, and known limitations.",
    "assemblies": "Parsed mechanical structures with parts, subassemblies, wiring routes, and exploded-view transforms.",
    "parts": "Selectable components with purpose, material, dimensions, mass, fasteners, and manufacturing options.",
    "materials": "Open or sourced material properties with confidence labels and manufacturing compatibility.",
    "task_requirements": "Task-preserving constraints such as payload, reach, cycle time, envelope, fatigue, and serviceability.",
    "analysis_jobs": "Queued orchestration work for FreeCAD, FEA, wiring, BOM, manufacturing, and report generation workers.",
    "manufacturing_options": "Ways to make or buy a part, including cost range, lead time, supplier link, and risk notes.",
    "wiring_routes": "Connector-to-connector harness paths with bend-radius, clearance, and harness BOM metadata.",
    "reports": "Advisory summaries of task status, payload re-rating, cost, manufacturing, wiring, risks, and unknowns.",
}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
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
        warnings = [
            "Analysis outputs are advisory stubs until FreeCAD, CalculiX, KiCad, WireViz, and supplier workers are wired.",
            "Use MECHAFLOW_API_PORT to choose a local port; port 0 lets the OS pick an available port.",
        ]
        return StatusResponse(
            status="degraded" if list_adapter_statuses() else "ok",
            service=settings.app_name,
            adapters=[adapter.model_dump(mode="json") for adapter in list_adapter_statuses()],
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

    @app.get(f"{settings.api_prefix}/reference-designs", response_model=list[ReferenceDesign], tags=["catalog"])
    def reference_designs() -> list[ReferenceDesign]:
        return DEFAULT_REFERENCE_DESIGNS

    @app.get(f"{settings.api_prefix}/materials", response_model=list[Material], tags=["catalog"])
    def materials() -> list[Material]:
        return DEFAULT_MATERIALS

    @app.get(f"{settings.api_prefix}/assemblies/sample", response_model=Assembly, tags=["catalog"])
    def sample_assembly() -> Assembly:
        return DEFAULT_ASSEMBLY

    @app.get(f"{settings.api_prefix}/projects/sample", response_model=Project, tags=["projects"])
    def sample_project() -> Project:
        return Project(
            id="project-open-gripper-demo",
            name="Open gripper task-preserving edit demo",
            description="Local seed project for frontend integration before persistence is added.",
            reference_design_id=DEFAULT_REFERENCE_DESIGNS[0].id,
            active_task=GRIPPER_TASK,
            assemblies=[DEFAULT_ASSEMBLY],
            materials=DEFAULT_MATERIALS,
        )

    @app.post(f"{settings.api_prefix}/projects", response_model=Project, status_code=201, tags=["projects"])
    def create_project(project: Project) -> Project:
        # Persistence will be added with SQLite/PostgreSQL. For now this endpoint
        # validates the public schema and echoes a normalized project.
        return project

    @app.post(f"{settings.api_prefix}/analysis-jobs", response_model=AnalysisJob, status_code=202, tags=["jobs"])
    def create_analysis_job(request: AnalysisJobRequest) -> AnalysisJob:
        adapter = choose_adapter(request)
        now = datetime.now(timezone.utc)
        return AnalysisJob(
            id=f"job-{uuid4()}",
            job_type=request.job_type,
            status=AnalysisJobStatus.queued if adapter else AnalysisJobStatus.blocked_missing_adapter,
            target_id=request.target_id,
            project_id=request.project_id,
            adapter_name=adapter.status.name if adapter else "unassigned",
            local_compute_preferred=request.local_compute_preferred,
            input_summary=request.input_summary,
            result_summary={
                "message": "Job accepted as orchestration metadata only; no heavy CAD or simulation tool was invoked."
            },
            created_at=now,
            updated_at=now,
        )

    return app


app = create_app()
