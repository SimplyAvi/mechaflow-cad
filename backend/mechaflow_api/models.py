"""Domain schemas for the MechaFlow CAD orchestration API.

These models are intentionally tool-agnostic. FreeCAD, CalculiX, KiCad,
WireViz, and supplier APIs can populate or consume them later through adapters.
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
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
    solver_unavailable = "solver_unavailable"
    review_required = "review_required"
    completed = "completed"
    failed = "failed"


class AnalysisExecutionTarget(str, Enum):
    local = "local"
    cloud_recommended_when_configured = "cloud_recommended_when_configured"
    unavailable = "unavailable"


class AnalysisExecutionRecommendationStatus(str, Enum):
    ready = "ready"
    review_required = "review_required"
    unavailable = "unavailable"


class EstimateBasis(str, Enum):
    measured_local = "measured_local"
    deterministic_local_heuristic = "deterministic_local_heuristic"
    cloud_planning_estimate = "cloud_planning_estimate"
    unavailable = "unavailable"


class CachedArtifactStatus(str, Enum):
    current = "current"
    metadata_only = "metadata_only"
    stale_missing_files = "stale_missing_files"
    superseded = "superseded"


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


class WiringReviewStatus(str, Enum):
    passed = "pass"
    warning = "warning"
    review_required = "review_required"


class AnalysisReadinessState(str, Enum):
    pre_solver_ready = "pre_solver_ready"
    review_required = "review_required"
    blocked_missing_inputs = "blocked_missing_inputs"
    solver_result_available = "solver_result_available"


class AnalysisResultTrust(str, Enum):
    demo_estimate = "demo_estimate"
    pre_solver_input = "pre_solver_input"
    solver_result = "solver_result"


class AnalysisLoadType(str, Enum):
    force = "force"
    moment = "moment"
    pressure = "pressure"
    gravity = "gravity"
    thermal = "thermal"


class AnalysisConstraintType(str, Enum):
    fixed = "fixed"
    pinned = "pinned"
    bearing = "bearing"
    contact = "contact"
    symmetry = "symmetry"
    review_required = "review_required"


class SolverPipelineStepStatus(str, Enum):
    stub_contract = "stub_contract"
    ready_for_worker = "ready_for_worker"
    unavailable_review_required = "unavailable_review_required"
    blocked_missing_input = "blocked_missing_input"
    completed_by_solver = "completed_by_solver"


class LocalSolverToolAvailability(str, Enum):
    available = "available"
    unavailable = "unavailable"


class LocalSolverToolReviewStatus(str, Enum):
    available_not_invoked = "available_not_invoked"
    unavailable_review_required = "unavailable_review_required"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Vector3(StrictModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


class Transform(StrictModel):
    translation_mm: Vector3 = Field(default_factory=Vector3)
    rotation_deg: Vector3 = Field(default_factory=Vector3)


class SourceAttribution(StrictModel):
    label: str
    url: HttpUrl | None = None
    retrieved_at: datetime | None = None
    license: str | None = None


class MoneyRange(StrictModel):
    currency: str = "USD"
    min: NonNegativeFloat | None = None
    max: NonNegativeFloat | None = None
    confidence: RecommendationConfidence = RecommendationConfidence.unknown

    @model_validator(mode="after")
    def validate_bounds(self) -> MoneyRange:
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("min must be less than or equal to max")
        return self


class MaterialProperties(StrictModel):
    density_kg_m3: PositiveFloat | None = None
    elastic_modulus_gpa: PositiveFloat | None = None
    yield_strength_mpa: PositiveFloat | None = None
    ultimate_strength_mpa: PositiveFloat | None = None
    poisson_ratio: float | None = Field(default=None, ge=0.0, lt=0.5)
    thermal_conductivity_w_mk: PositiveFloat | None = None
    heat_deflection_temp_c: PositiveFloat | None = None
    max_service_temp_c: PositiveFloat | None = None


class Material(StrictModel):
    id: str
    name: str
    family: str
    properties: MaterialProperties = Field(default_factory=MaterialProperties)
    compatible_processes: list[ManufacturingProcess] = Field(default_factory=list)
    cost: MoneyRange | None = None
    source: SourceAttribution | None = None
    confidence: RecommendationConfidence = RecommendationConfidence.unknown
    notes: list[str] = Field(default_factory=list)


class ManufacturingOption(StrictModel):
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


class Connector(StrictModel):
    id: str
    name: str
    pin_count: int | None = Field(default=None, ge=0)
    part_id: str | None = None
    component_id: str | None = None
    kind: str = "connector"
    gender: Literal["plug", "receptacle", "board", "inline", "unknown"] = "unknown"
    pin_labels: list[str] = Field(default_factory=list)
    voltage_rating_v: PositiveFloat | None = None
    current_rating_a: PositiveFloat | None = None
    mating_connector_id: str | None = None
    notes: list[str] = Field(default_factory=list)


class RouteEndpoint(StrictModel):
    connector_id: str
    part_id: str | None = None
    pin_label: str | None = None
    role: Literal["source", "sink", "pass_through", "service_disconnect", "unknown"] = "unknown"
    notes: list[str] = Field(default_factory=list)


class ElectronicsComponent(StrictModel):
    id: str
    name: str
    component_type: Literal["pcb", "sensor", "actuator", "controller", "power", "connector", "cable_accessory", "unknown"] = "unknown"
    mounted_part_id: str | None = None
    connector_ids: list[str] = Field(default_factory=list)
    bom_item_ids: list[str] = Field(default_factory=list)
    datasheet_url: HttpUrl | None = None
    notes: list[str] = Field(default_factory=list)
    confidence: RecommendationConfidence = RecommendationConfidence.unknown


class WireSegment(StrictModel):
    id: str
    name: str
    conductor_count: int | None = Field(default=None, ge=1)
    wire_gauge_awg: int | None = Field(default=None, ge=0, le=40)
    length_mm: PositiveFloat | None = None
    signal_or_power: str = "review required"
    color: str | None = None
    from_endpoint: RouteEndpoint | None = None
    to_endpoint: RouteEndpoint | None = None
    bom_item_id: str | None = None
    notes: list[str] = Field(default_factory=list)
    confidence: RecommendationConfidence = RecommendationConfidence.unknown


class WiringRuleSet(StrictModel):
    id: str
    name: str
    required_clearance_min_mm: NonNegativeFloat | None = None
    required_bend_radius_min_mm: PositiveFloat | None = None
    bend_radius_multiplier: PositiveFloat | None = None
    required_service_loop_min_mm: NonNegativeFloat | None = None
    evidence_basis: Literal["user_input", "manufacturer_data", "heuristic", "review_required"] = "review_required"
    notes: list[str] = Field(default_factory=list)


class WiringRoute(StrictModel):
    id: str
    name: str
    from_connector: Connector
    to_connector: Connector
    endpoints: list[RouteEndpoint] = Field(default_factory=list)
    path_points_mm: list[Vector3] = Field(default_factory=list)
    wire_segment_ids: list[str] = Field(default_factory=list)
    electronics_component_ids: list[str] = Field(default_factory=list)
    bend_radius_min_mm: PositiveFloat | None = None
    clearance_min_mm: NonNegativeFloat | None = None
    service_loop_mm: NonNegativeFloat | None = None
    rule_set_id: str | None = None
    harness_bom: list[str] = Field(default_factory=list)
    diagram_ref: str | None = None
    risk_notes: list[str] = Field(default_factory=list)
    confidence: RecommendationConfidence = RecommendationConfidence.unknown


class WiringReviewEvidence(StrictModel):
    check: str
    status: WiringReviewStatus
    basis: Literal["explicit_data", "heuristic_estimate", "missing_input", "review_required"]
    message: str
    measured_value: float | None = None
    threshold_value: float | None = None
    units: str | None = None
    related_ids: list[str] = Field(default_factory=list)


class WiringRouteReview(StrictModel):
    route_id: str
    route_name: str
    status: WiringReviewStatus
    summary: str
    evidence: list[WiringReviewEvidence] = Field(default_factory=list)
    bom_item_ids: list[str] = Field(default_factory=list)
    endpoint_part_ids: list[str] = Field(default_factory=list)
    review_required: list[str] = Field(default_factory=list)


class WiringReviewReport(StrictModel):
    project_id: str
    status: WiringReviewStatus
    summary: str
    route_reviews: list[WiringRouteReview] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    assumptions: list[str] = Field(default_factory=list)


def _reject_nonfinite_number(value: Any) -> Any:
    try:
        return "non-finite" if not math.isfinite(float(value)) else value
    except (TypeError, ValueError, OverflowError):
        return value


PositiveFiniteFloat = Annotated[float, BeforeValidator(_reject_nonfinite_number), Field(gt=0)]


class PartDimensions(StrictModel):
    length_mm: PositiveFiniteFloat | None = None
    width_mm: PositiveFiniteFloat | None = None
    height_mm: PositiveFiniteFloat | None = None
    diameter_mm: PositiveFiniteFloat | None = None
    thickness_mm: PositiveFiniteFloat | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Part(StrictModel):
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


class AssemblyNode(StrictModel):
    id: str
    name: str
    assembly_id: str | None = None
    part_id: str | None = None
    part_ids: list[str] = Field(default_factory=list)
    child_assembly_ids: list[str] = Field(default_factory=list)
    exploded_transform: Transform = Field(default_factory=Transform)


class Assembly(StrictModel):
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
    lead_time_days_min: NonNegativeFloat | None = None
    lead_time_days_max: NonNegativeFloat | None = None
    datasheet_url: HttpUrl | None = None
    license_or_terms: str | None = None

    @model_validator(mode="after")
    def validate_lead_time_bounds(self) -> BOMItem:
        if (
            self.lead_time_days_min is not None
            and self.lead_time_days_max is not None
            and self.lead_time_days_min > self.lead_time_days_max
        ):
            raise ValueError("lead_time_days_min must be less than or equal to lead_time_days_max")
        return self


class TaskRequirement(StrictModel):
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


class Modification(StrictModel):
    model_config = ConfigDict(extra="forbid")

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


class MaterialSubstitutionRequest(StrictModel):
    target_part_id: str
    material_id: str
    manufacturing_process: ManufacturingProcess
    description: str | None = None
    modification_id: str | None = None

    @field_validator("material_id", "target_part_id")
    @classmethod
    def validate_nonblank_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("ids must not be blank")
        return value


class MaterialSubstitutionOption(StrictModel):
    id: str
    part_id: str
    part_name: str
    current_material_id: str | None = None
    current_material_name: str | None = None
    current_process: ManufacturingProcess | None = None
    material_id: str
    material_name: str
    process: ManufacturingProcess
    compatible: bool
    review_required: bool = True
    blocked_reasons: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    weight_delta_kg: float | None = None
    cost_range: MoneyRange | None = None
    cost_delta: MoneyRange | None = None
    lead_time_days_min: NonNegativeFloat | None = None
    lead_time_days_max: NonNegativeFloat | None = None
    stiffness_gpa: PositiveFloat | None = None
    yield_strength_mpa: PositiveFloat | None = None
    heat_limit_c: PositiveFloat | None = None
    material_confidence: RecommendationConfidence = RecommendationConfidence.unknown
    manufacturing_confidence: RecommendationConfidence = RecommendationConfidence.unknown
    summary: str
    task_guidance: str
    manufacturing_guidance: str
    wiring_guidance: str
    modification: Modification


class AnalysisJobRequest(BaseModel):
    job_type: AnalysisJobType
    target_id: str
    project_id: str
    local_compute_preferred: bool = True
    input_summary: dict[str, Any] = Field(default_factory=dict)


class AnalysisArtifact(StrictModel):
    id: str
    job_id: str
    kind: AnalysisArtifactKind
    title: str
    summary: str
    payload: dict[str, Any] = Field(default_factory=dict)
    confidence: RecommendationConfidence = RecommendationConfidence.heuristic
    generated_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AnalysisEstimateRange(StrictModel):
    label: str
    min: NonNegativeFloat | None = None
    max: NonNegativeFloat | None = None
    unit: str
    basis: EstimateBasis = EstimateBasis.unavailable
    confidence: RecommendationConfidence = RecommendationConfidence.unknown
    notice: str

    @model_validator(mode="after")
    def validate_bounds(self) -> AnalysisEstimateRange:
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("min must be less than or equal to max")
        return self


class AnalysisExecutionTargetRecommendation(StrictModel):
    recommended_target: AnalysisExecutionTarget
    status: AnalysisExecutionRecommendationStatus
    summary: str
    reasons: list[str] = Field(default_factory=list)
    missing_local_tools: list[str] = Field(default_factory=list)
    review_required: list[str] = Field(default_factory=list)
    model_complexity_score: NonNegativeFloat = 0
    expected_runtime_minutes: AnalysisEstimateRange
    cost_estimate: AnalysisEstimateRange
    wait_time_estimate: AnalysisEstimateRange
    cloud_execution_available: bool = False
    cloud_configuration_required: bool = True
    cloud_notice: str = "Cloud execution is a planning boundary only. No provider, billing, credentials, or remote execution is configured."


class CachedAnalysisArtifactReference(StrictModel):
    artifact_id: str
    job_id: str
    project_id: str
    kind: AnalysisArtifactKind
    title: str
    status: CachedArtifactStatus
    generated_by: str
    generated_at: datetime
    download_urls: list[str] = Field(default_factory=list)
    summary: str | None = None
    stale_reason: str | None = None


class CachedAnalysisReportReference(StrictModel):
    report_id: str
    project_id: str
    title: str
    status: ReportStatus
    generated_at: datetime
    derived_from_job_id: str | None = None
    current: bool = True
    summary: str | None = None


class AnalysisJob(StrictModel):
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
    recommendation: AnalysisExecutionTargetRecommendation | None = None
    cached_artifact_refs: list[CachedAnalysisArtifactReference] = Field(default_factory=list)
    cached_report_refs: list[CachedAnalysisReportReference] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AnalysisJobQueue(StrictModel):
    project_id: str
    jobs: list[AnalysisJob] = Field(default_factory=list)
    status_counts: dict[str, int] = Field(default_factory=dict)
    local_ready_count: int = 0
    cloud_planning_count: int = 0
    review_required_count: int = 0
    unavailable_count: int = 0
    summary: str


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


class AnalysisLoadCase(StrictModel):
    id: str
    name: str
    description: str
    load_type: AnalysisLoadType
    target_part_ids: list[str] = Field(default_factory=list)
    magnitude: float | None = None
    unit: str | None = None
    direction: Vector3 = Field(default_factory=Vector3)
    application_region: str = "review required"
    confidence: RecommendationConfidence = RecommendationConfidence.heuristic
    review_required: bool = True


class AnalysisConstraint(StrictModel):
    id: str
    name: str
    constraint_type: AnalysisConstraintType
    target_part_ids: list[str] = Field(default_factory=list)
    region: str = "review required"
    degrees_of_freedom: list[str] = Field(default_factory=list)
    confidence: RecommendationConfidence = RecommendationConfidence.heuristic
    review_required: bool = True


class AnalysisMaterialPropertySet(StrictModel):
    material_id: str | None = None
    material_name: str = "Review required"
    properties: MaterialProperties = Field(default_factory=MaterialProperties)
    provenance: RecommendationConfidence = RecommendationConfidence.unknown
    source: SourceAttribution | None = None
    review_notes: list[str] = Field(default_factory=list)


class AnalysisThermalGuidance(StrictModel):
    max_service_temp_c: PositiveFloat | None = None
    heat_deflection_temp_c: PositiveFloat | None = None
    guidance: str
    confidence: RecommendationConfidence = RecommendationConfidence.unknown
    review_required: bool = True


class ExpectedAnalysisResultArtifact(StrictModel):
    kind: str
    title: str
    file_format: str
    produced_by: str
    replaces_demo_estimate: bool = True
    review_required_before_release: bool = True


class SolverInputSpec(StrictModel):
    geometry_source: str | None = None
    units: str = "mm, N, MPa"
    mesh_size_mm: PositiveFloat | None = None
    freecad_document: str | None = None
    gmsh_model: str | None = None
    calculix_input_deck: str | None = None
    notes: list[str] = Field(default_factory=list)


class SolverPipelineStep(StrictModel):
    order: int = Field(ge=1)
    adapter_name: str
    open_source_tool: str
    action: str
    consumes: list[str] = Field(default_factory=list)
    produces: list[str] = Field(default_factory=list)
    status: SolverPipelineStepStatus = SolverPipelineStepStatus.stub_contract
    review_notes: list[str] = Field(default_factory=list)


class LocalSolverToolStatus(StrictModel):
    adapter_name: str
    open_source_tool: str
    role: str
    binary_candidates: list[str] = Field(default_factory=list)
    resolved_command: str | None = None
    availability: LocalSolverToolAvailability = LocalSolverToolAvailability.unavailable
    review_status: LocalSolverToolReviewStatus = LocalSolverToolReviewStatus.unavailable_review_required
    message: str
    required_for_real_run: bool = True
    install_guidance: str | None = None
    version_command: list[str] = Field(default_factory=list)
    detected_version: str | None = None


class LocalSolverExecutionMode(StrictModel):
    id: str
    label: str
    status: str
    summary: str
    required_tools: list[str] = Field(default_factory=list)
    missing_tools: list[str] = Field(default_factory=list)
    review_required: list[str] = Field(default_factory=list)
    endpoints: list[str] = Field(default_factory=list)


class LocalSolverReadinessSummary(StrictModel):
    status: str
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    tool_statuses: list[LocalSolverToolStatus] = Field(default_factory=list)
    available_tools: list[str] = Field(default_factory=list)
    missing_tools: list[str] = Field(default_factory=list)
    execution_modes: list[LocalSolverExecutionMode] = Field(default_factory=list)
    install_guidance: list[str] = Field(default_factory=list)
    summary: str


class AnalysisReadinessRequest(BaseModel):
    target_id: str
    job_type: AnalysisJobType = AnalysisJobType.run_fea
    include_demo_estimates: bool = True


class AnalysisReadinessPreview(StrictModel):
    project_id: str
    target_id: str
    target_name: str
    target_kind: Literal["part", "assembly"]
    state: AnalysisReadinessState
    trust_label: AnalysisResultTrust = AnalysisResultTrust.pre_solver_input
    summary: str
    criteria: list[str] = Field(default_factory=list)
    load_cases: list[AnalysisLoadCase] = Field(default_factory=list)
    constraints: list[AnalysisConstraint] = Field(default_factory=list)
    material_properties: AnalysisMaterialPropertySet | None = None
    thermal_guidance: AnalysisThermalGuidance | None = None
    solver_inputs: SolverInputSpec = Field(default_factory=SolverInputSpec)
    expected_result_artifacts: list[ExpectedAnalysisResultArtifact] = Field(default_factory=list)
    solver_pipeline: list[SolverPipelineStep] = Field(default_factory=list)
    demo_estimates: list[str] = Field(default_factory=list)
    review_required: list[str] = Field(default_factory=list)
    recommended_job_request: AnalysisJobRequest | None = None
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AnalysisReport(StrictModel):
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


class Project(StrictModel):
    model_config = ConfigDict(json_schema_extra={"description": "A user workspace that keeps task requirements active while a design changes."})

    id: str
    name: str
    description: str | None = None
    reference_design_id: str | None = None
    active_task: TaskRequirement | None = None
    units: Literal["mm", "cm", "m", "in"] = "mm"
    metadata: dict[str, Any] = Field(default_factory=dict)
    assemblies: list[Assembly] = Field(default_factory=list)
    materials: list[Material] = Field(default_factory=list)
    electronics_components: list[ElectronicsComponent] = Field(default_factory=list)
    wire_segments: list[WireSegment] = Field(default_factory=list)
    wiring_rules: list[WiringRuleSet] = Field(default_factory=list)
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

        assembly_ids = {assembly.id for assembly in self.assemblies}
        part_ids = {part.id for assembly in self.assemblies for part in assembly.parts}
        ambiguous_targets = assembly_ids & part_ids
        if ambiguous_targets:
            raise ValueError(f"assembly and part ids must not overlap: {sorted(ambiguous_targets)}")

        duplicate_routes = _duplicate_ids(
            [route.id for assembly in self.assemblies for route in assembly.wiring_routes]
        )
        if duplicate_routes:
            raise ValueError(f"wiring route ids must be unique across project assemblies: {sorted(duplicate_routes)}")

        electronics_ids = [component.id for component in self.electronics_components]
        duplicate_electronics = _duplicate_ids(electronics_ids)
        if duplicate_electronics:
            raise ValueError(f"electronics component ids must be unique within a project: {sorted(duplicate_electronics)}")

        wire_segment_ids = [segment.id for segment in self.wire_segments]
        duplicate_wire_segments = _duplicate_ids(wire_segment_ids)
        if duplicate_wire_segments:
            raise ValueError(f"wire segment ids must be unique within a project: {sorted(duplicate_wire_segments)}")

        wiring_rule_ids = [rule.id for rule in self.wiring_rules]
        duplicate_wiring_rules = _duplicate_ids(wiring_rule_ids)
        if duplicate_wiring_rules:
            raise ValueError(f"wiring rule ids must be unique within a project: {sorted(duplicate_wiring_rules)}")

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
    electronics_components: list[ElectronicsComponent] = Field(default_factory=list)
    wire_segments: list[WireSegment] = Field(default_factory=list)
    wiring_rules: list[WiringRuleSet] = Field(default_factory=list)
    wiring_routes: list[WiringRoute] = Field(default_factory=list)
    wiring_review: WiringReviewReport | None = None
    reports: list[AnalysisReport] = Field(default_factory=list)
    analysis_readiness_previews: list[AnalysisReadinessPreview] = Field(default_factory=list)
    analysis_job_queue: AnalysisJobQueue | None = None


class MaterialSubstitutionPreview(StrictModel):
    mode: Literal["preview", "applied"]
    persisted: bool
    option: MaterialSubstitutionOption
    report: AnalysisReport
    panel_data: ProjectPanelData


PROJECT_FILE_FORMAT = "mechaflow-cad.project"
PROJECT_FILE_SCHEMA_VERSION = "1.0"


class ProjectFileMetadata(StrictModel):
    exported_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source_api_version: str = "0.1.0"
    exported_by: str = "mechaflow-cad-api"
    notes: list[str] = Field(default_factory=list)


class ProjectFile(StrictModel):
    format: Literal["mechaflow-cad.project"] = PROJECT_FILE_FORMAT
    schema_version: Literal["1.0"] = PROJECT_FILE_SCHEMA_VERSION
    metadata: ProjectFileMetadata = Field(default_factory=ProjectFileMetadata)
    project: Project
    analysis_readiness_previews: list[AnalysisReadinessPreview] = Field(default_factory=list)
    extensions: dict[str, Any] = Field(default_factory=dict)


class ProjectFileImportResponse(BaseModel):
    status: Literal["imported"] = "imported"
    project_id: str
    message: str
    warnings: list[str] = Field(default_factory=list)
    project: Project
    panel_data: ProjectPanelData
