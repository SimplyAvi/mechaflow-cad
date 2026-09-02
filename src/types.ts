export type JobStatus = 'queued' | 'running' | 'blocked' | 'complete';
export type RiskLevel = 'low' | 'medium' | 'high';
export type RatingStatus = 'passes' | 'watch' | 'fails';

export interface ReferenceDesign {
  id: string;
  name: string;
  sourceUrl: string;
  license: string;
  formats: string[];
  task: TaskRequirement;
  assembly: Assembly;
  materialOptions: MaterialOption[];
  bom: BOMItem[];
  manufacturingOptions: ManufacturingOption[];
  analysisJobs: AnalysisJob[];
  wiringRoutes: WiringRoute[];
}

export interface TaskRequirement {
  label: string;
  targetPayloadLb: number;
  cycleTimeSeconds: number;
  reachMeters: number;
  serviceGoal: string;
}

export interface Assembly {
  name: string;
  explodedProgress: number;
  parts: Part[];
}

export interface Part {
  id: string;
  name: string;
  subassembly: string;
  purpose: string;
  material: string;
  manufacturingProcess: string;
  weightLb: number;
  estimatedCostUsd: number;
  stressRisk: RiskLevel;
  replacementDifficulty: RiskLevel;
  fasteners: string[];
  relatedWires: string[];
  rating: CapabilityRating;
  visual: PartVisual;
}

export interface PartVisual {
  x: number;
  y: number;
  width: number;
  height: number;
  explodeX: number;
  explodeY: number;
  color: string;
}

export interface CapabilityRating {
  status: RatingStatus;
  payloadLb: number;
  safetyFactor: number;
  summary: string;
  warning?: string;
}

export interface MaterialOption {
  id: string;
  partId: string;
  material: string;
  process: string;
  payloadLb: number;
  safetyFactor: number;
  weightDeltaLb: number;
  costDeltaUsd: number;
  taskImpact: string;
  wiringImpact: string;
  manufacturingImpact: string;
  status: RatingStatus;
}

export interface AnalysisJob {
  id: string;
  name: string;
  worker: 'FreeCAD' | 'CalculiX/Gmsh' | 'KiCad/WireViz' | 'Supplier';
  status: JobStatus;
  progress: number;
  summary: string;
}

export interface BOMItem {
  id: string;
  item: string;
  quantity: number;
  source: 'open design' | 'off the shelf' | 'fabricate' | 'wire harness';
  unitCostUsd: number;
  leadTimeDays: number;
}

export interface ManufacturingOption {
  id: string;
  label: string;
  process: string;
  estimatedCostUsd: string;
  leadTime: string;
  riskNote: string;
}

export interface WiringRoute {
  id: string;
  name: string;
  connectedParts: string[];
  clearanceStatus: RatingStatus;
  bendRadiusMm: number;
  serviceLoop: boolean;
  note: string;
}
