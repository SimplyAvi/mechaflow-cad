export type JobStatus = 'queued' | 'running' | 'blocked' | 'solver-unavailable' | 'review-required' | 'failed' | 'complete';
export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';
export type RatingStatus = 'passes' | 'watch' | 'fails';
export type AnalysisReadinessState = 'pre_solver_ready' | 'review_required' | 'blocked_missing_inputs' | 'solver_result_available';
export type AnalysisResultTrust = 'demo_estimate' | 'pre_solver_input' | 'solver_result';
export type AuthoringUnit = 'mm' | 'cm' | 'm' | 'in';
export type CADPrimitiveShape = 'base_plate' | 'beam' | 'cylinder_joint' | 'bracket' | 'motor_block' | 'connector' | 'electronics' | 'tool';
export type CADJointType = 'fixed' | 'revolute' | 'prismatic' | 'linear' | 'tool_mount' | 'unassigned';

export interface ReferenceDesign {
  id: string;
  name: string;
  sourceUrl: string | null;
  license: string;
  formats: string[];
  task: TaskRequirement;
  assembly: Assembly;
  assemblies: Assembly[];
  materialOptions: MaterialOption[];
  bom: BOMItem[];
  manufacturingOptions: ManufacturingOption[];
  analysisJobs: AnalysisJob[];
  electronicsComponents: ElectronicsComponent[];
  wireSegments: WireSegment[];
  wiringRoutes: WiringRoute[];
  wiringReview: WiringReviewReport | null;
  reports: AdvisoryReport[];
  units: AuthoringUnit;
  backendProject: BackendProject;
  analysisReadinessPreviews: AnalysisReadinessPreview[];
  backend: BackendConnectionSummary;
}

export interface BackendConnectionSummary {
  source: 'backend-panel-data' | 'bundled-mock' | 'bundled-mock-after-error';
  apiBaseUrl?: string;
  projectId: string;
  endpoint: string;
  concepts: string[];
  advisoryNotice: string;
  integrationStubs: string[];
}

export interface TaskRequirement {
  label: string;
  targetPayloadLb: number | null;
  cycleTimeSeconds: number | null;
  reachMeters: number | null;
  serviceGoal: string;
  safetyFactorMin?: number;
  validationMethod?: string;
}

export interface Assembly {
  id: string;
  name: string;
  explodedProgress: number | null;
  analysisReadiness: AnalysisReadinessPreview;
  parts: Part[];
}

export interface Part {
  id: string;
  name: string;
  subassembly: string;
  purpose: string;
  material: string;
  manufacturingProcess: string;
  weightLb: number | null;
  costRangeUsd: UsdRange | null;
  stressRisk: RiskLevel;
  replacementDifficulty: RiskLevel;
  fasteners: string[];
  relatedWires: string[];
  rating: CapabilityRating;
  designCriteria: DesignCriterion[];
  analysisReadiness: AnalysisReadinessPreview;
  visual: PartVisual;
  authoring: PartAuthoringData;
}

export interface DesignCriterion {
  id: string;
  label: string;
  value: string;
  status: 'measured' | 'estimated' | 'review-required';
  plainEnglish: string;
  sourceConfidence: string;
}

export interface AnalysisLoadCase {
  id: string;
  name: string;
  description: string;
  load_type: string;
  target_part_ids: string[];
  magnitude?: number | null;
  unit?: string | null;
  direction: BackendVector3;
  application_region: string;
  confidence: string;
  review_required: boolean;
}

export interface AnalysisConstraint {
  id: string;
  name: string;
  constraint_type: string;
  target_part_ids: string[];
  region: string;
  degrees_of_freedom: string[];
  confidence: string;
  review_required: boolean;
}

export interface AnalysisMaterialPropertySet {
  material_id?: string | null;
  material_name: string;
  properties: BackendMaterial['properties'];
  provenance: string;
  source?: unknown;
  review_notes: string[];
}

export interface AnalysisThermalGuidance {
  max_service_temp_c?: number | null;
  heat_deflection_temp_c?: number | null;
  guidance: string;
  confidence: string;
  review_required: boolean;
}

export interface ExpectedAnalysisResultArtifact {
  kind: string;
  title: string;
  file_format: string;
  produced_by: string;
  replaces_demo_estimate: boolean;
  review_required_before_release: boolean;
}

export interface SolverInputSpec {
  geometry_source?: string | null;
  units: string;
  mesh_size_mm?: number | null;
  freecad_document?: string | null;
  gmsh_model?: string | null;
  calculix_input_deck?: string | null;
  notes: string[];
}

export interface SolverPipelineStep {
  order: number;
  adapter_name: string;
  open_source_tool: string;
  action: string;
  consumes: string[];
  produces: string[];
  status: string;
  review_notes: string[];
}

export interface AnalysisReadinessPreview {
  project_id: string;
  target_id: string;
  target_name: string;
  target_kind: 'part' | 'assembly';
  state: AnalysisReadinessState;
  trust_label: AnalysisResultTrust;
  summary: string;
  criteria: string[];
  load_cases: AnalysisLoadCase[];
  constraints: AnalysisConstraint[];
  material_properties?: AnalysisMaterialPropertySet | null;
  thermal_guidance?: AnalysisThermalGuidance | null;
  solver_inputs: SolverInputSpec;
  expected_result_artifacts: ExpectedAnalysisResultArtifact[];
  solver_pipeline: SolverPipelineStep[];
  demo_estimates: string[];
  review_required: string[];
  recommended_job_request?: BackendAnalysisJobRequest | null;
  generated_at?: string;
}

export interface PartVisual {
  x: number;
  y: number;
  width: number;
  height: number;
  explodeX: number;
  explodeY: number;
  color: string;
  shape?: 'base' | 'joint' | 'link' | 'plate' | 'tool' | 'pcb' | 'motor' | 'connector' | 'bracket';
  rotationDeg?: number;
  zIndex?: number;
}

export interface PartAuthoringDimensions {
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  diameterMm: number | null;
  thicknessMm: number | null;
}

export interface PartAuthoringData {
  primitive: CADPrimitiveShape;
  positionMm: BackendVector3;
  rotationDeg: BackendVector3;
  dimensionsMm: PartAuthoringDimensions;
  color: string;
  materialId: string | null;
  parentPartId: string | null;
  jointType: CADJointType;
  assignedToPartId: string | null;
  connectorId: string | null;
  authored: boolean;
}

export interface CapabilityRating {
  status: RatingStatus;
  payloadLb: number | null;
  safetyFactor: number | null;
  summary: string;
  warning?: string;
}

export interface MaterialOption {
  id: string;
  partId: string;
  material: string;
  materialId: string;
  process: string;
  processValue: string;
  currentMaterial: string | null;
  currentProcess: string | null;
  payloadLb: number | null;
  safetyFactor: number | null;
  weightDeltaLb: number | null;
  costRangeUsd: UsdRange | null;
  leadTimeRangeDays: NumberRange | null;
  stiffnessGpa: number | null;
  yieldStrengthMpa: number | null;
  heatLimitC: number | null;
  materialConfidence: string;
  manufacturingConfidence: string;
  reviewRequired: boolean;
  blockedReasons: string[];
  warnings: string[];
  taskImpact: string;
  wiringImpact: string;
  manufacturingImpact: string;
  status: RatingStatus;
  backendModification: BackendModificationPreview;
}

export interface BackendModificationPreview {
  endpoint: string;
  method: 'POST';
  payload: BackendModification;
  reportTitle: string;
  reportSummary: string;
  reportStatus: string;
}

export interface AnalysisJobArtifactSummary {
  id?: string;
  kind: string;
  title: string;
  summary?: string;
  confidence?: string;
  generatedBy?: string;
  payload?: Record<string, unknown>;
}

export interface AnalysisEstimateRange {
  label: string;
  min: number | null;
  max: number | null;
  unit: string;
  basis: string;
  confidence: string;
  notice: string;
}

export interface AnalysisExecutionTargetRecommendation {
  recommended_target: 'local' | 'cloud_recommended_when_configured' | 'unavailable';
  status: 'ready' | 'review_required' | 'unavailable';
  summary: string;
  reasons: string[];
  missing_local_tools: string[];
  review_required: string[];
  model_complexity_score: number;
  expected_runtime_minutes: AnalysisEstimateRange;
  cost_estimate: AnalysisEstimateRange;
  wait_time_estimate: AnalysisEstimateRange;
  cloud_execution_available: boolean;
  cloud_configuration_required: boolean;
  cloud_notice: string;
}

export interface CachedAnalysisArtifactReference {
  artifact_id: string;
  job_id: string;
  project_id: string;
  kind: string;
  title: string;
  status: 'current' | 'metadata_only' | 'stale_missing_files' | 'superseded';
  generated_by: string;
  generated_at: string;
  download_urls: string[];
  summary?: string | null;
  stale_reason?: string | null;
}

export interface CachedAnalysisReportReference {
  report_id: string;
  project_id: string;
  title: string;
  status: string;
  generated_at: string;
  derived_from_job_id?: string | null;
  current: boolean;
  summary?: string | null;
}

export interface AnalysisJobQueue {
  project_id: string;
  jobs: BackendAnalysisJob[];
  status_counts: Record<string, number>;
  local_ready_count: number;
  cloud_planning_count: number;
  review_required_count: number;
  unavailable_count: number;
  summary: string;
}

export interface LocalSolverToolStatus {
  adapter_name: string;
  open_source_tool: string;
  role: string;
  binary_candidates: string[];
  resolved_command?: string | null;
  availability: 'available' | 'unavailable';
  review_status: string;
  message: string;
  required_for_real_run: boolean;
  install_guidance?: string | null;
  version_command: string[];
  detected_version?: string | null;
}

export interface LocalSolverExecutionMode {
  id: string;
  label: string;
  status: string;
  summary: string;
  required_tools: string[];
  missing_tools: string[];
  review_required: string[];
  endpoints: string[];
}

export interface LocalSolverReadinessSummary {
  status: string;
  generated_at?: string;
  tool_statuses: LocalSolverToolStatus[];
  available_tools: string[];
  missing_tools: string[];
  execution_modes: LocalSolverExecutionMode[];
  install_guidance: string[];
  summary: string;
}

export interface AnalysisJob {
  id: string;
  name: string;
  worker: string;
  targetId: string;
  status: JobStatus;
  progress: number | null;
  summary: string;
  expectedArtifact?: string;
  artifacts: AnalysisJobArtifactSummary[];
  recommendation?: AnalysisExecutionTargetRecommendation | null;
  cachedArtifactRefs: CachedAnalysisArtifactReference[];
  cachedReportRefs: CachedAnalysisReportReference[];
  reviewStatus?: string;
  trustLabel?: string;
}

export interface BOMItem {
  id: string;
  item: string;
  quantity: number;
  source: 'open design' | 'off the shelf' | 'fabricate' | 'wire harness';
  unitCostRangeUsd: UsdRange | null;
  leadTimeDays: number | null;
  leadTimeRange?: NumberRange | null;
}

export interface NumberRange {
  min: number | null;
  max: number | null;
}

export interface UsdRange {
  min: number | null;
  max: number | null;
}

export interface ManufacturingOption {
  id: string;
  label: string;
  process: string;
  costDisplay: string;
  leadTime: string;
  riskNote: string;
  partName?: string;
}

export type WiringReviewStatus = 'pass' | 'warning' | 'review_required';

export interface ElectronicsComponent {
  id: string;
  name: string;
  componentType: string;
  mountedPartId: string | null;
  connectorIds: string[];
  bomItemIds: string[];
  notes: string[];
  confidence: string;
}

export interface WireSegment {
  id: string;
  name: string;
  conductorCount: number | null;
  wireGaugeAwg: number | null;
  lengthMm: number | null;
  signalOrPower: string;
  color: string | null;
  bomItemId: string | null;
  notes: string[];
  confidence: string;
}

export interface WiringReviewEvidence {
  check: string;
  status: WiringReviewStatus;
  basis: string;
  message: string;
  measuredValue: number | null;
  thresholdValue: number | null;
  units: string | null;
  relatedIds: string[];
}

export interface WiringRouteReview {
  routeId: string;
  routeName: string;
  status: WiringReviewStatus;
  summary: string;
  evidence: WiringReviewEvidence[];
  bomItemIds: string[];
  endpointPartIds: string[];
  reviewRequired: string[];
}

export interface WiringReviewReport {
  projectId: string;
  status: WiringReviewStatus;
  summary: string;
  routeReviews: WiringRouteReview[];
  assumptions: string[];
  generatedAt?: string;
}

export interface WiringEndpoint {
  connectorId: string;
  partId: string | null;
  pinLabel: string | null;
  role: string;
}

export interface WiringConnector {
  id: string;
  name: string;
  pinCount: number | null;
  partId: string | null;
  componentId: string | null;
  gender: string;
  pinLabels: string[];
  voltageRatingV: number | null;
  currentRatingA: number | null;
}

export interface WiringRoute {
  id: string;
  name: string;
  connectedParts: string[];
  connectors: WiringConnector[];
  endpoints: WiringEndpoint[];
  clearanceStatus: RatingStatus;
  reviewStatus: WiringReviewStatus;
  reviewSummary: string;
  evidence: WiringReviewEvidence[];
  bendRadiusMm: number | null;
  clearanceMm: number | null;
  serviceLoopMm: number | null;
  pathLengthMm: number | null;
  wireSegmentIds: string[];
  electronicsComponentIds: string[];
  harnessBom: string[];
  diagramRef: string | null;
  note: string;
}

export interface AdvisoryReport {
  id: string;
  title: string;
  status: string;
  summary: string;
  risks: string[];
  recommendations: string[];
  unknowns: string[];
}

export interface BackendApiMetadata {
  product: string;
  version: string;
  api_prefix: string;
  concepts: string[];
  advisory_notice: string;
  local_development: Record<string, string>;
  integration_stubs: Array<{ name?: string; capability?: string; status?: string }>;
}

export interface BackendProjectPanelData {
  project: BackendProject;
  task_requirements: BackendTaskRequirement[];
  bom_items: BackendBOMItem[];
  manufacturing_options: BackendPartManufacturingOptions[];
  electronics_components: BackendElectronicsComponent[];
  wire_segments: BackendWireSegment[];
  wiring_rules: BackendWiringRuleSet[];
  wiring_routes: BackendWiringRoute[];
  wiring_review?: BackendWiringReviewReport | null;
  reports: BackendAnalysisReport[];
  analysis_readiness_previews?: AnalysisReadinessPreview[];
  analysis_job_queue?: AnalysisJobQueue | null;
}

export interface BackendProjectFile {
  format: 'mechaflow-cad.project';
  schema_version: '1.0';
  metadata: {
    exported_at?: string;
    source_api_version: string;
    exported_by: string;
    notes: string[];
  };
  project: BackendProject;
  analysis_readiness_previews: AnalysisReadinessPreview[];
  extensions: Record<string, unknown>;
}

export interface BackendProjectFileImportResponse {
  status: 'imported';
  project_id: string;
  message: string;
  warnings: string[];
  project: BackendProject;
  panel_data: BackendProjectPanelData;
}

export interface BackendProject {
  id: string;
  name: string;
  description?: string | null;
  reference_design_id?: string | null;
  active_task?: BackendTaskRequirement | null;
  units?: AuthoringUnit;
  metadata?: Record<string, unknown>;
  assemblies: BackendAssembly[];
  materials: BackendMaterial[];
  electronics_components: BackendElectronicsComponent[];
  wire_segments: BackendWireSegment[];
  wiring_rules: BackendWiringRuleSet[];
  modifications: BackendModification[];
  analysis_jobs: BackendAnalysisJob[];
  reports: BackendAnalysisReport[];
  created_at?: string;
  updated_at?: string;
}

export interface BackendTaskRequirement {
  id: string;
  kind: string;
  description: string;
  target_value?: number | null;
  unit?: string | null;
  safety_factor_min?: number | null;
  validation_method: string;
  assumptions: string[];
}

export interface BackendAssembly {
  id: string;
  name: string;
  root_node_id: string;
  nodes: BackendAssemblyNode[];
  parts: BackendPart[];
  wiring_routes: BackendWiringRoute[];
  assembly_structure_confidence?: string;
}

export interface BackendAssemblyNode {
  id: string;
  name: string;
  assembly_id?: string | null;
  part_id?: string | null;
  part_ids: string[];
  child_assembly_ids: string[];
  exploded_transform: BackendTransform;
}

export interface BackendTransform {
  translation_mm: BackendVector3;
  rotation_deg: BackendVector3;
}

export interface BackendVector3 {
  x: number;
  y: number;
  z: number;
}

export interface BackendPart {
  id: string;
  name: string;
  category: string;
  purpose?: string | null;
  material_id?: string | null;
  dimensions: BackendPartDimensions;
  mass_kg?: number | null;
  manufacturing_options: BackendManufacturingOption[];
  related_fasteners: string[];
  wiring_route_ids: string[];
  source_file?: string | null;
  metadata: Record<string, unknown>;
}

export interface BackendPartDimensions {
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  diameter_mm?: number | null;
  thickness_mm?: number | null;
  metadata: Record<string, unknown>;
}

export interface BackendMaterial {
  id: string;
  name: string;
  family: string;
  properties: {
    density_kg_m3?: number | null;
    elastic_modulus_gpa?: number | null;
    yield_strength_mpa?: number | null;
    ultimate_strength_mpa?: number | null;
    poisson_ratio?: number | null;
    thermal_conductivity_w_mk?: number | null;
    heat_deflection_temp_c?: number | null;
    max_service_temp_c?: number | null;
  };
  compatible_processes: string[];
  cost?: BackendMoneyRange | null;
  source?: unknown;
  confidence: string;
  notes: string[];
}

export interface BackendMoneyRange {
  currency: string;
  min?: number | null;
  max?: number | null;
  confidence: string;
}

export interface BackendManufacturingOption {
  id: string;
  process: string;
  description: string;
  cost?: BackendMoneyRange | null;
  lead_time_days_min?: number | null;
  lead_time_days_max?: number | null;
  supplier_url?: string | null;
  risk_notes: string[];
  confidence: string;
}

export interface BackendPartManufacturingOptions {
  part_id: string;
  part_name: string;
  material_id?: string | null;
  options: BackendManufacturingOption[];
}

export interface BackendBOMItem {
  id: string;
  part_id?: string | null;
  name: string;
  quantity: number;
  unit: string;
  supplier?: string | null;
  supplier_part_number?: string | null;
  price?: BackendMoneyRange | null;
  lead_time_days_min?: number | null;
  lead_time_days_max?: number | null;
  datasheet_url?: string | null;
  license_or_terms?: string | null;
}

export interface BackendElectronicsComponent {
  id: string;
  name: string;
  component_type: string;
  mounted_part_id?: string | null;
  connector_ids: string[];
  bom_item_ids: string[];
  datasheet_url?: string | null;
  notes: string[];
  confidence: string;
}

export interface BackendWireSegment {
  id: string;
  name: string;
  conductor_count?: number | null;
  wire_gauge_awg?: number | null;
  length_mm?: number | null;
  signal_or_power: string;
  color?: string | null;
  from_endpoint?: BackendRouteEndpoint | null;
  to_endpoint?: BackendRouteEndpoint | null;
  bom_item_id?: string | null;
  notes: string[];
  confidence: string;
}

export interface BackendWiringRuleSet {
  id: string;
  name: string;
  required_clearance_min_mm?: number | null;
  required_bend_radius_min_mm?: number | null;
  bend_radius_multiplier?: number | null;
  required_service_loop_min_mm?: number | null;
  evidence_basis: string;
  notes: string[];
}

export interface BackendRouteEndpoint {
  connector_id: string;
  part_id?: string | null;
  pin_label?: string | null;
  role: string;
  notes: string[];
}

export interface BackendWiringRoute {
  id: string;
  name: string;
  from_connector: BackendConnector;
  to_connector: BackendConnector;
  endpoints: BackendRouteEndpoint[];
  path_points_mm: BackendVector3[];
  wire_segment_ids: string[];
  electronics_component_ids: string[];
  bend_radius_min_mm?: number | null;
  clearance_min_mm?: number | null;
  service_loop_mm?: number | null;
  rule_set_id?: string | null;
  harness_bom: string[];
  diagram_ref?: string | null;
  risk_notes: string[];
  confidence: string;
}

export interface BackendConnector {
  id: string;
  name: string;
  pin_count?: number | null;
  part_id?: string | null;
  component_id?: string | null;
  kind?: string;
  gender?: string;
  pin_labels?: string[];
  voltage_rating_v?: number | null;
  current_rating_a?: number | null;
  mating_connector_id?: string | null;
  notes?: string[];
}

export interface BackendWiringReviewEvidence {
  check: string;
  status: WiringReviewStatus;
  basis: string;
  message: string;
  measured_value?: number | null;
  threshold_value?: number | null;
  units?: string | null;
  related_ids: string[];
}

export interface BackendWiringRouteReview {
  route_id: string;
  route_name: string;
  status: WiringReviewStatus;
  summary: string;
  evidence: BackendWiringReviewEvidence[];
  bom_item_ids: string[];
  endpoint_part_ids: string[];
  review_required: string[];
}

export interface BackendWiringReviewReport {
  project_id: string;
  status: WiringReviewStatus;
  summary: string;
  route_reviews: BackendWiringRouteReview[];
  generated_at?: string;
  assumptions: string[];
}

export interface BackendAnalysisJobRequest {
  job_type: string;
  target_id: string;
  project_id: string;
  local_compute_preferred?: boolean;
  input_summary?: Record<string, unknown>;
}

export interface BackendAnalysisJob {
  id: string;
  job_type: string;
  status: string;
  target_id: string;
  project_id?: string | null;
  adapter_name: string;
  local_compute_preferred: boolean;
  input_summary: Record<string, unknown>;
  result_summary: Record<string, unknown>;
  artifacts: Array<{
    id?: string;
    kind: string;
    title: string;
    summary?: string;
    confidence?: string;
    generated_by?: string;
    payload?: Record<string, unknown>;
  }>;
  recommendation?: AnalysisExecutionTargetRecommendation | null;
  cached_artifact_refs?: CachedAnalysisArtifactReference[];
  cached_report_refs?: CachedAnalysisReportReference[];
  created_at?: string;
  updated_at?: string;
}

export interface BackendAnalysisReport {
  id: string;
  project_id: string;
  title: string;
  status: string;
  summary: string;
  task_results: Array<Record<string, unknown>>;
  weight_delta_kg?: number | null;
  cost_delta?: BackendMoneyRange | null;
  manufacturing_impacts: string[];
  wiring_impacts: string[];
  risks: string[];
  unknowns: string[];
  recommendations: string[];
  assumptions: string[];
  generated_at?: string;
}

export interface BackendModification {
  id: string;
  target_part_id: string;
  description: string;
  material_id?: string | null;
  dimension_changes: Record<string, number>;
  manufacturing_process?: string | null;
  created_at?: string;
}

export interface BackendMaterialSubstitutionRequest {
  target_part_id: string;
  material_id: string;
  manufacturing_process: string;
  description?: string | null;
  modification_id?: string | null;
}

export interface BackendMaterialSubstitutionOption {
  id: string;
  part_id: string;
  part_name: string;
  current_material_id?: string | null;
  current_material_name?: string | null;
  current_process?: string | null;
  material_id: string;
  material_name: string;
  process: string;
  compatible: boolean;
  review_required: boolean;
  blocked_reasons: string[];
  warnings: string[];
  weight_delta_kg?: number | null;
  cost_range?: BackendMoneyRange | null;
  cost_delta?: BackendMoneyRange | null;
  lead_time_days_min?: number | null;
  lead_time_days_max?: number | null;
  stiffness_gpa?: number | null;
  yield_strength_mpa?: number | null;
  heat_limit_c?: number | null;
  material_confidence: string;
  manufacturing_confidence: string;
  summary: string;
  task_guidance: string;
  manufacturing_guidance: string;
  wiring_guidance: string;
  modification: BackendModification;
}

export interface BackendMaterialSubstitutionPreview {
  mode: 'preview' | 'applied';
  persisted: boolean;
  option: BackendMaterialSubstitutionOption;
  report: BackendAnalysisReport;
  panel_data: BackendProjectPanelData;
}
