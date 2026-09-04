"""Domain schemas for the MechaFlow CAD orchestration API.

These models are intentionally tool-agnostic. FreeCAD, CalculiX, KiCad,
WireViz, and supplier APIs can populate or consume them later through adapters.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    NonNegativeFloat,
    PositiveFloat,
    field_validator,
    model_validator,
)


class CADFileFormat(str, Enum):
    freecad = "freecad"
    step = "step"
    stl = "stl"
    gltf = "gltf"
    obj = "obj"
    dxf = "dxf"
    kicad = "kicad"
    wireviz = "wireviz"
    unknown = "unknown"


class RecommendationConfidence(str, Enum):
    authoritative_source = "verified_from_authoritative_source"
    manufacturer_data = "verified_from_manufacturer_data"
    calculated = "calculated_from_user_inputs"
    heuristic = "estimated_from_heuristic"
    unknown = "unknown_or_needs_review"


class ManufacturingProcess(str, Enum):
    off_the_shelf = "off_the_shelf"
    additive_fdm = "additive_fdm"
    additive_sls = "additive_sls"
    cnc_machining = "cnc_machining"
    sheet_metal = "sheet_metal"
    pcb_fabrication = "pcb_fabrication"
    wire_harness = "wire_harness"
    casting = "casting"
    unknown = "unknown"


class TaskKind(str, Enum):
    lift_payload = "lift_payload"
    reach = "reach"
    cycle_time = "cycle_time"
    fit_envelope = "fit_envelope"
    fatigue_life = "fatigue_life"
    serviceability = "serviceability"
    wiring_clearance = "wiring_clearance"
    custom = "custom"


class AnalysisJobType(str, Enum):
    import_design = "import_design"
    generate_exploded_view = "generate_exploded_view"
    extract_part_list = "extract_part_list"
    estimate_mass_properties = "estimate_mass_properties"
    quick_load_heuristic = "quick_load_heuristic"
    run_fea = "run_fea"
    rerate_payload_capability = "rerate_payload_capability"
    check_wire_routing = "check_wire_routing"
    generate_bom = "generate_bom"
    generate_manufacturing_report = "generate_manufacturing_report"


class AnalysisJobStatus(str, Enum):
    queued = "queued"
    running = "running"
    blocked_missing_adapter = "blocked_missing_adapter"
    completed = "completed"
    failed = "failed"


class AnalysisArtifactKind(str, Enum):
    cad_metadata = "cad_metadata"
    exploded_view = "exploded_view"
    part_list = "part_list"
    mass_properties = "mass_properties"
    load_heuristic = "load_heuristic"
    fea_summary = "fea_summary"
    payload_rerating = "payload_rerating"
    wiring_check = "wiring_check"
    bom = "bom"
    manufacturing_report = "manufacturing_report"


class ReportStatus(str, Enum):
    draft = "draft"
    advisory = "advisory"
    requires_review = "requires_review"
    superseded = "superseded"


class Vector3(BaseModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


class Transform(BaseModel):
    translation_mm: Vector3 = Field(default_factory=Vector3)
    rotation_deg: Vector3 = Field(default_factory=Vector3)


class SourceAttribution(BaseModel):
    label: str
    url: HttpUrl | None = None
    retrieved_at: datetime | None = None
    license: str | None = None


class MoneyRange(BaseModel):
    currency: str = "USD"
    min: NonNegativeFloat | None = None
    max: NonNegativeFloat | None = None
    confidence: RecommendationConfidence = RecommendationConfidence.unknown

    @model_validator(mode="after")
    def validate_bounds(self) -> MoneyRange:
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("min must be less than or equal to max")
        return self


class MaterialProperties(BaseModel):
    density_kg_m3: PositiveFloat | None = None
    elastic_modulus_gpa: PositiveFloat | None = None
    yield_strength_mpa: PositiveFloat | None = None
    ultimate_strength_mpa: PositiveFloat | None = None
    poisson_ratio: float | None = Field(default=None, ge=0.0, lt=0.5)
    thermal_conductivity_w_mk: PositiveFloat | None = None


class Material(BaseModel):
    id: str
    name: str
    family: str
    properties: MaterialProperties = Field(default_factory=MaterialProperties)
    compatible_processes: list[ManufacturingProcess] = Field(default_factory=list)
    cost: MoneyRange | None = None
    source: SourceAttribution | None = None
    confidence: RecommendationConfidence = RecommendationConfidence.unknown
    notes: list[str] = Field(default_factory=list)


class ManufacturingOption(BaseModel):
    id: str
    process: ManufacturingProcess
    description: str
    cost: MoneyRange | None = None
    lead_time_days_min: NonNegativeFloat | None = None
    lead_time_days_max: NonNegativeFloat | None = None
    supplier_url: HttpUrl | None = None
    risk_notes: list[str] = Field(default_factory=list)
    confidence: RecommendationConfidence = RecommendationConfidence.heuristic

    @model_validator(mode="after")
    def validate_lead_time_bounds(self) -> ManufacturingOption:
        if (
            self.lead_time_days_min is not None
            and self.lead_time_days_max is not None
            and self.lead_time_days_min > self.lead_time_days_max
        ):
            raise ValueError("lead_time_days_min must be less than or equal to lead_time_days_max")
        return self


class Connector(BaseModel):
    id: str
    name: str
    pin_count: int | None = Field(default=None, ge=0)
    part_id: str | None = None


class WiringRoute(BaseModel):
    id: str
    name: str
    from_connector: Connector
    to_connector: Connector
    path_points_mm: list[Vector3] = Field(default_factory=list)
    bend_radius_min_mm: PositiveFloat | None = None
    clearance_min_mm: NonNegativeFloat | None = None
    harness_bom: list[str] = Field(default_factory=list)
    risk_notes: list[str] = Field(default_factory=list)
    confidence: RecommendationConfidence = RecommendationConfidence.unknown


class PartDimensions(BaseModel):
    length_mm: PositiveFloat | None = None
    width_mm: PositiveFloat | None = None
    height_mm: PositiveFloat | None = None
    thickness_mm: PositiveFloat | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Part(BaseModel):
    id: str
    name: str
    category: str
    purpose: str | None = None
    material_id: str | None = None
    dimensions: PartDimensions = Field(default_factory=PartDimensions)
    mass_kg: NonNegativeFloat | None = None
    manufacturing_options: list[ManufacturingOption] = Field(default_factory=list)
    related_fasteners: list[str] = Field(default_factory=list)
    wiring_route_ids: list[str] = Field(default_factory=list)
    source_file: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AssemblyNode(BaseModel):
    id: str
    name: str
    part_ids: list[str] = Field(default_factory=list)
    child_assembly_ids: list[str] = Field(default_factory=list)
    exploded_transform: Transform = Field(default_factory=Transform)


class Assembly(BaseModel):
    id: str
    name: str
    root_node_id: str
    nodes: list[AssemblyNode] = Field(default_factory=list)
    parts: list[Part] = Field(default_factory=list)
    wiring_routes: list[WiringRoute] = Field(default_factory=list)
    assembly_structure_confidence: RecommendationConfidence = RecommendationConfidence.unknown


class BOMItem(BaseModel):
    id: str
    part_id: str | None = None
    name: str
    quantity: PositiveFloat = 1
    unit: str = "each"
    supplier: str | None = None
    supplier_part_number: str | None = None
    price: MoneyRange | None = None
    datasheet_url: HttpUrl | None = None
    license_or_terms: str | None = None


class TaskRequirement(BaseModel):
    id: str
    kind: TaskKind
    description: str
    target_value: float | None = None
    unit: str | None = None
    safety_factor_min: PositiveFloat | None = None
    validation_method: Literal["heuristic", "simulation", "test", "review", "unknown"] = "unknown"
    assumptions: list[str] = Field(default_factory=list)


class ReferenceDesign(BaseModel):
    id: str
    name: str
    source_url: HttpUrl
    license: str
    supported_file_formats: list[CADFileFormat] = Field(default_factory=list)
    cad_files: list[str] = Field(default_factory=list)
    assembly_files: list[str] = Field(default_factory=list)
    drawings: list[str] = Field(default_factory=list)
    bom_items: list[BOMItem] = Field(default_factory=list)
    electronics_files: list[str] = Field(default_factory=list)
    manufacturing_notes: list[str] = Field(default_factory=list)
    known_limitations: list[str] = Field(default_factory=list)
    example_tasks: list[TaskRequirement] = Field(default_factory=list)
    source: SourceAttribution | None = None


class Modification(BaseModel):
    id: str
    target_part_id: str
    description: str
    material_id: str | None = None
    dimension_changes: dict[str, float] = Field(default_factory=dict)
    manufacturing_process: ManufacturingProcess | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("material_id")
    @classmethod
    def validate_material_id(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("material_id must not be blank")
        return value


class AnalysisJobRequest(BaseModel):
    job_type: AnalysisJobType
    target_id: str
    project_id: str
    local_compute_preferred: bool = True
    input_summary: dict[str, Any] = Field(default_factory=dict)


class AnalysisArtifact(BaseModel):
    id: str
    job_id: str
    kind: AnalysisArtifactKind
    title: str
    summary: str
    payload: dict[str, Any] = Field(default_factory=dict)
    confidence: RecommendationConfidence = RecommendationConfidence.heuristic
    generated_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AnalysisJob(BaseModel):
    id: str
    job_type: AnalysisJobType
    status: AnalysisJobStatus
    target_id: str
    project_id: str
    adapter_name: str
    local_compute_preferred: bool = True
    input_summary: dict[str, Any] = Field(default_factory=dict)
    result_summary: dict[str, Any] = Field(default_factory=dict)
    artifacts: list[AnalysisArtifact] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AnalysisJobPlan(BaseModel):
    adapter_name: str
    job_type: AnalysisJobType
    queue_name: str
    target_id: str
    local_execution: bool = True
    required_capabilities: list[str] = Field(default_factory=list)
    expected_artifacts: list[AnalysisArtifactKind] = Field(default_factory=list)
    command_hint: str | None = None
    notes: list[str] = Field(default_factory=list)


class AnalysisReport(BaseModel):
    id: str
    project_id: str
    title: str
    status: ReportStatus = ReportStatus.advisory
    summary: str
    task_results: list[dict[str, Any]] = Field(default_factory=list)
    weight_delta_kg: float | None = None
    cost_delta: MoneyRange | None = None
    manufacturing_impacts: list[str] = Field(default_factory=list)
    wiring_impacts: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


PROJECT_ID_PATTERN = re.compile(r"^[A-Za-z0-9._~-]+$")


def validate_project_id(value: str) -> str:
    if value in {"sample", ".", ".."}:
        raise ValueError(f"project id {value!r} is reserved")
    if not PROJECT_ID_PATTERN.fullmatch(value):
        raise ValueError("project id must be a URL-safe path segment")
    return value


def _duplicate_ids(values: list[str]) -> set[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return duplicates


class Project(BaseModel):
    model_config = ConfigDict(json_schema_extra={"description": "A user workspace that keeps task requirements active while a design changes."})

    id: str
    name: str
    description: str | None = None
    reference_design_id: str | None = None
    active_task: TaskRequirement | None = None
    assemblies: list[Assembly] = Field(default_factory=list)
    materials: list[Material] = Field(default_factory=list)
    modifications: list[Modification] = Field(default_factory=list)
    analysis_jobs: list[AnalysisJob] = Field(default_factory=list)
    reports: list[AnalysisReport] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        return validate_project_id(value)

    @model_validator(mode="after")
    def validate_unique_ids(self) -> Project:
        duplicate_assemblies = _duplicate_ids([assembly.id for assembly in self.assemblies])
        if duplicate_assemblies:
            raise ValueError(f"assembly ids must be unique within a project: {sorted(duplicate_assemblies)}")

        duplicate_parts = _duplicate_ids(
            [part.id for assembly in self.assemblies for part in assembly.parts]
        )
        if duplicate_parts:
            raise ValueError(f"part ids must be unique across project assemblies: {sorted(duplicate_parts)}")

        duplicate_routes = _duplicate_ids(
            [route.id for assembly in self.assemblies for route in assembly.wiring_routes]
        )
        if duplicate_routes:
            raise ValueError(f"wiring route ids must be unique across project assemblies: {sorted(duplicate_routes)}")

        material_ids = [material.id for material in self.materials]
        if any(not material_id.strip() for material_id in material_ids):
            raise ValueError("material ids must not be blank")
        duplicate_materials = _duplicate_ids(material_ids)
        if duplicate_materials:
            raise ValueError(f"material ids must be unique within a project: {sorted(duplicate_materials)}")
        return self


class ProjectModificationResponse(BaseModel):
    project: Project
    report: AnalysisReport


class CatalogSeedResponse(BaseModel):
    reference_designs: list[ReferenceDesign] = Field(default_factory=list)
    materials: list[Material] = Field(default_factory=list)
    task_requirements: list[TaskRequirement] = Field(default_factory=list)
    sample_project: Project


class PartManufacturingOptions(BaseModel):
    part_id: str
    part_name: str
    material_id: str | None = None
    options: list[ManufacturingOption] = Field(default_factory=list)


class ProjectPanelData(BaseModel):
    project: Project
    task_requirements: list[TaskRequirement] = Field(default_factory=list)
    bom_items: list[BOMItem] = Field(default_factory=list)
    manufacturing_options: list[PartManufacturingOptions] = Field(default_factory=list)
    wiring_routes: list[WiringRoute] = Field(default_factory=list)
    reports: list[AnalysisReport] = Field(default_factory=list)
