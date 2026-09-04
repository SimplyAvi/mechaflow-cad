export type JobStatus = 'queued' | 'running' | 'blocked' | 'failed' | 'complete';
export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';
export type RatingStatus = 'passes' | 'watch' | 'fails';

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
  wiringRoutes: WiringRoute[];
  reports: AdvisoryReport[];
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
  visual: PartVisual;
}

export interface DesignCriterion {
  id: string;
  label: string;
  value: string;
  status: 'measured' | 'estimated' | 'review-required';
  plainEnglish: string;
  sourceConfidence: string;
}

export interface PartVisual {
  x: number;
  y: number;
  width: number;
  height: number;
  explodeX: number;
  explodeY: number;
  color: string;
  shape?: 'base' | 'joint' | 'link' | 'plate' | 'tool' | 'pcb';
  rotationDeg?: number;
  zIndex?: number;
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
  process: string;
  payloadLb: number | null;
  safetyFactor: number | null;
  weightDeltaLb: number | null;
  costRangeUsd: UsdRange | null;
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

export interface AnalysisJob {
  id: string;
  name: string;
  worker: string;
  status: JobStatus;
  progress: number | null;
  summary: string;
  expectedArtifact?: string;
}

export interface BOMItem {
  id: string;
  item: string;
  quantity: number;
  source: 'open design' | 'off the shelf' | 'fabricate' | 'wire harness';
  unitCostRangeUsd: UsdRange | null;
  leadTimeDays: number | null;
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

export interface WiringRoute {
  id: string;
  name: string;
  connectedParts: string[];
  clearanceStatus: RatingStatus;
  bendRadiusMm: number | null;
  serviceLoop: boolean | null;
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
  wiring_routes: BackendWiringRoute[];
  reports: BackendAnalysisReport[];
}

export interface BackendProject {
  id: string;
  name: string;
  description?: string | null;
  reference_design_id?: string | null;
  active_task?: BackendTaskRequirement | null;
  assemblies: BackendAssembly[];
  materials: BackendMaterial[];
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
  datasheet_url?: string | null;
  license_or_terms?: string | null;
}

export interface BackendWiringRoute {
  id: string;
  name: string;
  from_connector: BackendConnector;
  to_connector: BackendConnector;
  path_points_mm: BackendVector3[];
  bend_radius_min_mm?: number | null;
  clearance_min_mm?: number | null;
  harness_bom: string[];
  risk_notes: string[];
  confidence: string;
}

export interface BackendConnector {
  id: string;
  name: string;
  pin_count?: number | null;
  part_id?: string | null;
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
  artifacts: Array<{ kind: string; title: string }>;
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
