import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import {
  applyMaterialSubstitution,
  importProjectFile,
  importLocalProjectFile,
  loadCockpitDesign,
  loadLocalSolverReadiness,
  previewMaterialSubstitution,
  runLocalPreSolverAnalysis,
  runLocalSolverReadinessAnalysis,
  type MaterialSubstitutionResult,
} from './lib/api';
import type { AdvisoryReport, Assembly, LocalSolverReadinessSummary, MaterialOption, Part, PartAuthoringFeatureRecipe, PartAuthoringHolePattern, PartAuthoringSketchState, ReferenceDesign, UsdRange } from './types';
import {
  applyRobotArmLoadFixesToProject,
  assessRobotArmLoadRequirement,
  estimateAssemblySelfWeightLb,
  type RobotArmLoadFindingStatus,
  type RobotArmLoadSizingFinding,
  type RobotArmLoadSizingResult,
} from './lib/loadSizing';
import {
  buildDefaultHolePattern,
  buildPartOutputPreview,
  defaultSketchStateForPart,
  fastenerCatalogOptions,
  normalizeHolePattern,
  type PartOutputPreview,
} from './lib/partOutputs';
import { cadLifecycleMappings } from './lib/cadLifecycleMap';
import { readyExamples, buildReadyExampleDesign, isolateOfflineDesign, type ReadyExampleId } from './data/readyExamples';
import { localRobotArmPartCatalog, matchLocalPartCatalog, type LocalPartCatalogMatch } from './data/localPartCatalog';
import { mockReferenceDesign } from './data/mockDesign';
import { extractDesignIntentChips, taskFromDesignIntent, type DesignIntentChip } from './lib/designIntent';
import { VisualCadWorkspace } from './VisualCadWorkspace';
import {
  applyCatalogMatchToPart,
  applyIntentToProjectGeometry,
  buildLocalProjectFile,
  connectPartToParent,
  createAssemblyWithBase,
  createPrimitivePart,
  createWireRoute,
  deleteVisualPart,
  duplicatePart,
  formatLength,
  lengthFromMm,
  lengthToMm,
  remapDesignFromProject,
  unitOptions,
  updatePartGeometry,
  updateProjectTargets,
  updateProjectUnits,
  formatFeatureRecipeCallout,
} from './lib/visualAuthoring';
import type { AuthoringUnit, BackendManufacturingOption, BackendMaterial, BackendProject, CADJointType, CADPrimitiveShape } from './types';
import './App.css';

const formatCurrency = (value: number): string => {
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
};

const formatUsdRange = (range: UsdRange): string => {
  if (range.min != null && range.max != null) {
    if (range.min === range.max) return formatCurrency(range.min);
    return `${formatCurrency(range.min)}-${formatCurrency(range.max)}`;
  }
  if (range.min != null) return `From ${formatCurrency(range.min)}`;
  return `Up to ${formatCurrency(range.max ?? 0)}`;
};

const formatMeasurement = (value: number, maximumFractionDigits = 2): string => new Intl.NumberFormat('en-US', {
  maximumFractionDigits,
}).format(value);

const viewportSketchPlanes = ['Front plane', 'Top plane', 'Right plane', 'Offset plane through selected part'];
const viewportSketchProfiles = ['Centered rectangle profile with construction centerlines', 'Concentric circle profile with bore', 'Rounded slot cut profile', 'Two-hole bolt pattern sketch'];

const sketchOperationLabel: Record<PartAuthoringSketchState['operation'], string> = {
  sketch: 'Sketch profile',
  extrude: 'Extrude selected profile',
  cut: 'Cut or drill feature',
  finish: 'Finish edges',
};

const recipeFromSketchState = (part: Part, state: PartAuthoringSketchState): PartAuthoringFeatureRecipe => {
  const base = part.authoring.featureRecipe ?? {
    id: `recipe-viewport-${part.id}`,
    name: 'Viewport sketch, extrude, cut, and finish proxy',
    plane: state.plane,
    profile: state.profile,
    history: [],
    callouts: [],
  };
  const operationKind = state.operation === 'extrude' ? 'extrude' : state.operation === 'cut' ? 'cut' : state.operation === 'finish' ? 'finish' : 'sketch';
  const operationStep = {
    id: `viewport-${state.operation}`,
    label: sketchOperationLabel[state.operation],
    value: `${state.profile}; ${state.constraintSummary}${state.extrudeDepthMm == null ? '' : `; depth ${formatMeasurement(state.extrudeDepthMm)} mm`}`,
    kind: operationKind,
  } satisfies PartAuthoringFeatureRecipe['history'][number];
  const seededCallouts: PartAuthoringFeatureRecipe['callouts'] = [];
  if (part.authoring.dimensionsMm.diameterMm) seededCallouts.push({ id: 'od', label: 'Outer diameter', value: `${formatMeasurement(part.authoring.dimensionsMm.diameterMm)} mm`, kind: 'sketch' });
  if (part.authoring.dimensionsMm.lengthMm) seededCallouts.push({ id: 'length', label: 'Length', value: `${formatMeasurement(part.authoring.dimensionsMm.lengthMm)} mm`, kind: 'sketch' });
  if (part.authoring.dimensionsMm.heightMm) seededCallouts.push({ id: 'height', label: 'Extrude height', value: `${formatMeasurement(part.authoring.dimensionsMm.heightMm)} mm`, kind: 'extrude' });
  return {
    ...base,
    plane: state.plane,
    profile: state.profile,
    history: [...base.history.filter((step) => step.id !== operationStep.id), operationStep],
    callouts: base.callouts.length > 0 ? base.callouts : seededCallouts,
  };
};

const formatLeadTimeRange = (range?: { min: number | null; max: number | null } | null): string => {
  if (!range || (range.min == null && range.max == null)) return 'lead time review required';
  if (range.min != null && range.max != null) {
    if (range.min === range.max) return `${range.min} day${range.min === 1 ? '' : 's'}`;
    return `${range.min}-${range.max} days`;
  }
  if (range.min != null) return `from ${range.min} days`;
  return `up to ${range.max} days`;
};

const formatAnalysisEstimate = (estimate?: { min: number | null; max: number | null; unit: string } | null): string => {
  if (!estimate || (estimate.min == null && estimate.max == null)) return 'unavailable until configured';
  const unit = estimate.unit === 'USD' ? '' : ` ${estimate.unit}`;
  const value = (amount: number) => estimate.unit === 'USD' ? formatCurrency(amount) : formatMeasurement(amount);
  if (estimate.min != null && estimate.max != null) {
    if (estimate.min === estimate.max) return `${value(estimate.min)}${unit}`;
    return `${value(estimate.min)}-${value(estimate.max)}${unit}`;
  }
  if (estimate.min != null) return `from ${value(estimate.min)}${unit}`;
  return `up to ${value(estimate.max ?? 0)}${unit}`;
};

const formatThresholdMeasurement = (value: number, threshold: number): string => {
  const isBelow = value < threshold;
  for (let digits = 2; digits <= 6; digits += 1) {
    if ((Number(value.toFixed(digits)) < threshold) === isBelow) {
      return formatMeasurement(value, digits);
    }
  }
  return `${isBelow ? '<' : '>='} ${formatMeasurement(threshold)}`;
};

const formatSignedThresholdMeasurement = (value: number, threshold: number): string => {
  const formatted = formatThresholdMeasurement(value, threshold);
  if (formatted.startsWith('< ') || formatted.startsWith('>= ')) {
    return value >= 0 ? `${formatted.slice(0, 2)}+${formatted.slice(2)}` : formatted;
  }
  return `${value >= 0 ? '+' : ''}${formatted}`;
};

const totalBomCost = (items: ReferenceDesign['bom']): UsdRange | null => {
  if (items.length === 0 || items.some((item) => item.unitCostRangeUsd == null)) return null;
  const hasMin = items.every((item) => item.unitCostRangeUsd?.min != null);
  const hasMax = items.every((item) => item.unitCostRangeUsd?.max != null);
  if (!hasMin && !hasMax) return null;
  return {
    min: hasMin
      ? items.reduce((sum, item) => sum + item.quantity * (item.unitCostRangeUsd?.min ?? 0), 0)
      : null,
    max: hasMax
      ? items.reduce((sum, item) => sum + item.quantity * (item.unitCostRangeUsd?.max ?? 0), 0)
      : null,
  };
};

const statusLabel = {
  passes: 'Passes',
  watch: 'Watch',
  fails: 'Fails',
};

const riskLabel: Record<Part['stressRisk'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  unknown: 'Review required',
};

type DemoGuideStatus = 'complete' | 'available' | 'review' | 'unavailable';

interface DemoGuideStep {
  id: string;
  label: string;
  status: DemoGuideStatus;
  summary: string;
  anchor: string;
  actionLabel: string;
  canMarkReviewed?: boolean;
}

interface ExportedEvidenceSignature {
  projectId: string;
  jobIds: string[];
  artifactIds: string[];
  artifactContent: string;
}

type EvidenceArtifact = {
  id?: string;
  kind: string;
  title: string;
  summary?: string;
  confidence?: string;
  generated_by?: string;
  generatedBy?: string;
  payload?: unknown;
};

const canonicalizeEvidence = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalizeEvidence);
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalizeEvidence(item)]),
    );
  }
  return value;
};

const evidenceArtifactSignature = (artifacts: EvidenceArtifact[]): string => JSON.stringify(
  artifacts
    .map((artifact) => ({
      id: artifact.id ?? null,
      kind: artifact.kind,
      title: artifact.title,
      summary: artifact.summary ?? null,
      confidence: artifact.confidence ?? null,
      generatedBy: artifact.generated_by ?? artifact.generatedBy ?? null,
      payload: canonicalizeEvidence(artifact.payload ?? null),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
);

const demoGuideStatusLabel: Record<DemoGuideStatus, string> = {
  complete: 'Complete',
  available: 'Ready',
  review: 'Review required',
  unavailable: 'Unavailable',
};

const isSuccessfulLocalAnalysisJob = (job: ReferenceDesign['analysisJobs'][number]): boolean => (
  (job.worker === 'local-pre-solver-runner' || job.worker === 'local-calculix-fixture-runner')
  && (job.status === 'complete' || job.status === 'solver-unavailable')
  && (job.artifacts.length > 0 || job.cachedArtifactRefs.length > 0)
);

type WorkspaceMode = 'design' | 'analysis' | 'manufacturing' | 'reports' | 'backend';
type CanvasDrawer = 'none' | 'project' | 'part' | 'tools' | 'requirements' | 'drawing' | 'assembly' | 'command' | 'context';
type SpeechState = 'idle' | 'listening' | 'unsupported' | 'error';
type ReferenceImageSource = 'upload' | 'drop';

interface ReferenceImageRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  sizeLabel: string;
  lastModified: number;
  source: ReferenceImageSource;
}

interface RecentProjectSnapshot {
  design: ReferenceDesign;
  intentText: string;
  referenceImages: ReferenceImageRecord[];
  savedAt: number;
}

const RECENT_PROJECTS_STORAGE_KEY = 'mechaflow.recent-projects.v1';

const readRecentProject = (): RecentProjectSnapshot | null => {
  try {
    const raw = window.localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY);
    if (!raw) return null;
    const snapshots = JSON.parse(raw) as unknown;
    if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
    const snapshot = snapshots[0] as Partial<RecentProjectSnapshot>;
    const candidate = snapshot.design as Partial<ReferenceDesign> | undefined;
    if (!candidate || typeof candidate !== 'object' || typeof candidate.id !== 'string'
      || typeof candidate.name !== 'string' || !Array.isArray(candidate.assemblies)
      || !candidate.backend || typeof candidate.backend !== 'object') return null;
    return {
      design: snapshot.design as ReferenceDesign,
      intentText: typeof snapshot.intentText === 'string' ? snapshot.intentText : '',
      referenceImages: Array.isArray(snapshot.referenceImages) ? snapshot.referenceImages as ReferenceImageRecord[] : [],
      savedAt: typeof snapshot.savedAt === 'number' ? snapshot.savedAt : 0,
    };
  } catch {
    return null;
  }
};

const rememberRecentProject = (
  design: ReferenceDesign,
  intentText: string,
  referenceImages: ReferenceImageRecord[],
) => {
  try {
    const raw = window.localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) as unknown : [];
    const snapshots = Array.isArray(stored) ? stored as RecentProjectSnapshot[] : [];
    const nextSnapshot: RecentProjectSnapshot = {
      design: JSON.parse(JSON.stringify(design)) as ReferenceDesign,
      intentText,
      referenceImages: JSON.parse(JSON.stringify(referenceImages)) as ReferenceImageRecord[],
      savedAt: Date.now(),
    };
    const remaining = snapshots.filter((snapshot) => snapshot.design?.id !== design.id);
    window.localStorage.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify([nextSnapshot, ...remaining].slice(0, 6)));
  } catch {
    return;
  }
};

interface SpeechRecognitionResultEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const workspaceModes: { id: WorkspaceMode; label: string; summary: string }[] = [
  { id: 'design', label: 'Design', summary: '3D canvas, model tree, prompt, and selected-part tools' },
  { id: 'analysis', label: 'Analysis', summary: 'Readiness, local-safe runners, and job queue' },
  { id: 'manufacturing', label: 'Manufacturing', summary: 'BOM, make or buy paths, wiring, and electronics' },
  { id: 'reports', label: 'Reports', summary: 'Advisory reports and project import or export' },
  { id: 'backend', label: 'Backend', summary: 'API handoff and integration contract' },
];

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImageFile = (file: File): boolean => file.type.startsWith('image/') || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name);

const makeReferenceImageRecords = (files: File[], source: ReferenceImageSource): ReferenceImageRecord[] => files
  .filter(isImageFile)
  .map((file, index) => ({
    id: `reference-${source}-${file.name}-${file.lastModified}-${file.size}-${index}`,
    name: file.name,
    type: file.type || 'image file',
    size: file.size,
    sizeLabel: formatFileSize(file.size),
    lastModified: file.lastModified,
    source,
  }));

const summarizeTask = (design: ReferenceDesign): string => [
  design.task.targetPayloadLb == null ? 'payload unknown' : `${design.task.targetPayloadLb} lb payload`,
  design.task.cycleTimeSeconds == null ? 'cycle unknown' : `${design.task.cycleTimeSeconds} s cycle`,
  design.task.reachMeters == null ? 'reach unknown' : `${design.task.reachMeters} m reach`,
].join(', ');

const primitiveLabel = (primitive: CADPrimitiveShape): string => primitive.replaceAll('_', ' ');

const dimensionSummary = (part: Part, units: AuthoringUnit): string => {
  const dims = part.authoring.dimensionsMm;
  const rows = [
    dims.lengthMm == null ? null : `L ${formatLength(dims.lengthMm, units)}`,
    dims.widthMm == null ? null : `W ${formatLength(dims.widthMm, units)}`,
    dims.heightMm == null ? null : `H ${formatLength(dims.heightMm, units)}`,
    dims.diameterMm == null ? null : `Dia ${formatLength(dims.diameterMm, units)}`,
    dims.thicknessMm == null ? null : `Thk ${formatLength(dims.thicknessMm, units)}`,
  ].filter((row): row is string => row != null);
  return rows.length ? rows.join(' / ') : 'dimensions review required';
};

const reviewWarningsForPart = (part: Part, selectedOption?: MaterialOption): string[] => {
  const warnings = [
    part.rating.warning,
    ...part.analysisReadiness.review_required,
    ...part.designCriteria.filter((criterion) => criterion.status === 'review-required').map((criterion) => `${criterion.label}: ${criterion.value}`),
    ...(selectedOption?.warnings ?? []),
  ].filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  return [...new Set(warnings)].slice(0, 6);
};

const chipCopy = (chip: DesignIntentChip): string => `${chip.label}: ${chip.detail}`;

const inferUnitsFromIntent = (intent: string, fallback: AuthoringUnit): AuthoringUnit => {
  const lower = intent.toLowerCase();
  if (/\b(in|inch|inches)\b/.test(lower)) return 'in';
  if (/\bcm|centimeter|centimeters\b/.test(lower)) return 'cm';
  if (/\b(mm|millimeter|millimeters)\b/.test(lower)) return 'mm';
  if (/\b(m|meter|meters)\b/.test(lower)) return 'm';
  return fallback;
};

function App() {
  const [design, setDesign] = useState<ReferenceDesign | null>(null);
  const [selectedAssemblyId, setSelectedAssemblyId] = useState('');
  const [selectedPartId, setSelectedPartId] = useState('part-palm-plate');
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [explodePercent, setExplodePercent] = useState(45);
  const [rotationDeg, setRotationDeg] = useState(28);
  const [orbitPitchDeg, setOrbitPitchDeg] = useState(38);
  const [viewZoom, setViewZoom] = useState(1);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [focusedPartId, setFocusedPartId] = useState<string | null>(null);
  const [wireRouteTargetId, setWireRouteTargetId] = useState('');
  const [authoringMessage, setAuthoringMessage] = useState<string | null>('Visual CAD authoring is active: select geometry, choose units, create parts, add motors, and route wiring on the XYZ grid.');
  const [analysisRunMessage, setAnalysisRunMessage] = useState<string | null>(null);
  const [analysisRunPending, setAnalysisRunPending] = useState(false);
  const [solverReadiness, setSolverReadiness] = useState<LocalSolverReadinessSummary | null>(null);
  const [projectFileMessage, setProjectFileMessage] = useState<string | null>(null);
  const [projectFilePending, setProjectFilePending] = useState(false);
  const [substitutionPreview, setSubstitutionPreview] = useState<MaterialSubstitutionResult | null>(null);
  const [substitutionMessage, setSubstitutionMessage] = useState<string | null>(null);
  const [substitutionPending, setSubstitutionPending] = useState(false);
  const [demoStepReviews, setDemoStepReviews] = useState<Set<string>>(() => new Set());
  const [downstreamPanelsReviewed, setDownstreamPanelsReviewed] = useState({
    bom: false,
    manufacturing: false,
    wiring: false,
  });
  const [exportedEvidence, setExportedEvidence] = useState<ExportedEvidenceSignature | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('design');
  const [activeCanvasDrawer, setActiveCanvasDrawer] = useState<CanvasDrawer>('part');
  const [intentText, setIntentText] = useState('');
  const [intentMessage, setIntentMessage] = useState<string | null>('Robot arm demo is loaded. Describe a new mechanism or add a reference image to start faster.');
  const [partMatchQuery, setPartMatchQuery] = useState('joint motor');
  const [selectedCatalogMatchId, setSelectedCatalogMatchId] = useState('');
  const [guidedPartQuery, setGuidedPartQuery] = useState('lightweight sleeve with diagonal slots');
  const [guidedCatalogMatchId, setGuidedCatalogMatchId] = useState('catalog-lightened-joint-sleeve-coupler');
  const [referenceImages, setReferenceImages] = useState<ReferenceImageRecord[]>([]);
  const [imageDropActive, setImageDropActive] = useState(false);
  const [speechState, setSpeechState] = useState<SpeechState>('idle');
  const [dimensionDrafts, setDimensionDrafts] = useState<Record<string, string>>({});
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [assemblySelfWeightDraftLb, setAssemblySelfWeightDraftLb] = useState('');
  const projectLoadVersion = useRef(0);
  const importRequestVersion = useRef(0);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const markDemoStep = (stepId: string) => {
    setDemoStepReviews((current) => new Set(current).add(stepId));
  };

  const markDownstreamPanelReviewed = (panel: 'bom' | 'manufacturing' | 'wiring') => {
    setDownstreamPanelsReviewed((current) => ({ ...current, [panel]: true }));
  };

  const applyLoadedDesign = (loadedDesign: ReferenceDesign) => {
    projectLoadVersion.current += 1;
    setSubstitutionPreview(null);
    setSubstitutionMessage(null);
    setSolverReadiness(null);
    setAnalysisRunMessage(null);
    setSubstitutionPending(false);
    setAnalysisRunPending(false);
    setFocusedPartId(null);
    setDownstreamPanelsReviewed({ bom: false, manufacturing: false, wiring: false });
    setAssemblySelfWeightDraftLb('');
    setDemoStepReviews(new Set());
    setExportedEvidence(null);
    setDesign(loadedDesign);
    setSelectedAssemblyId(loadedDesign.assembly.id);
    setSelectedPartId(loadedDesign.assembly.parts[0]?.id ?? '');
    setSelectedOptionId(loadedDesign.materialOptions[0]?.id ?? '');
    markDemoStep('open-reference');
  };

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCockpitDesign().then((loadedDesign) => {
      if (!cancelled) {
        const recentProject = readRecentProject();
        const initialProject = recentProject?.design ?? loadedDesign;
        applyLoadedDesign(initialProject);
        setIntentText(recentProject?.intentText ?? '');
        setReferenceImages(recentProject?.referenceImages ?? []);
        if (recentProject) {
          setIntentMessage(`Reopened ${initialProject.name} from local recent-project history.`);
        }
        const loadedProjectVersion = projectLoadVersion.current;
        if (initialProject.backend.apiBaseUrl) {
          loadLocalSolverReadiness(initialProject.backend.apiBaseUrl)
            .then((readiness) => {
              if (!cancelled && projectLoadVersion.current === loadedProjectVersion) setSolverReadiness(readiness);
            })
            .catch((error) => {
              console.warn('Local solver readiness endpoint is unavailable.', error);
              if (!cancelled && projectLoadVersion.current === loadedProjectVersion) setSolverReadiness(null);
            });
        } else {
          setSolverReadiness(null);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectableAssemblies = useMemo(
    () => design?.assemblies.filter((assembly) => assembly.parts.length > 0) ?? [],
    [design],
  );

  const activeAssembly = useMemo(
    () => design?.assemblies.find((assembly) => assembly.id === selectedAssemblyId) ?? design?.assembly,
    [design, selectedAssemblyId],
  );

  const selectedPart = useMemo(
    () => activeAssembly?.parts.find((part) => part.id === selectedPartId) ?? activeAssembly?.parts[0],
    [activeAssembly, selectedPartId],
  );

  const selectedBackendPart = useMemo(
    () => design?.backendProject.assemblies.flatMap((assembly) => assembly.parts).find((part) => part.id === selectedPart?.id),
    [design, selectedPart?.id],
  );

  const selectedPartProcessOptions = selectedBackendPart?.manufacturing_options ?? [];
  const selectedPartProcessValue = typeof selectedBackendPart?.metadata?.preferred_manufacturing_process === 'string'
    ? selectedBackendPart.metadata.preferred_manufacturing_process
    : selectedPartProcessOptions[0]?.process ?? '';

  const materialCriterion = selectedPart?.designCriteria.find((criterion) => criterion.id === 'elasticity-stiffness');

  const materialOptions = useMemo(
    () => design?.materialOptions.filter((option) => option.partId === selectedPart?.id) ?? [],
    [design, selectedPart?.id],
  );

  const selectedOption = materialOptions.find((option) => option.id === selectedOptionId) ?? materialOptions[0];

  const intentChips = useMemo(() => extractDesignIntentChips(intentText), [intentText]);

  const catalogMatches = useMemo(() => matchLocalPartCatalog(partMatchQuery), [partMatchQuery]);
  const selectedCatalogMatch = catalogMatches.find((match) => match.item.id === selectedCatalogMatchId) ?? catalogMatches[0];
  const guidedCatalogMatches = useMemo(() => matchLocalPartCatalog(guidedPartQuery, localRobotArmPartCatalog, 4), [guidedPartQuery]);
  const selectedGuidedMatch = guidedCatalogMatches.find((match) => match.item.id === guidedCatalogMatchId) ?? guidedCatalogMatches[0];
  const automaticAssemblySelfWeightLb = useMemo(
    () => estimateAssemblySelfWeightLb(activeAssembly?.parts ?? []),
    [activeAssembly?.parts],
  );
  const assemblySelfWeightOverrideLb = Number(assemblySelfWeightDraftLb);
  const sizingSelfWeightLb = assemblySelfWeightDraftLb.trim() !== '' && Number.isFinite(assemblySelfWeightOverrideLb) && assemblySelfWeightOverrideLb >= 0
    ? assemblySelfWeightOverrideLb
    : automaticAssemblySelfWeightLb;
  const loadSizingResult = useMemo(() => {
    if (!design || !activeAssembly) return null;
    return assessRobotArmLoadRequirement(activeAssembly.parts, {
      payloadLb: design.task.targetPayloadLb ?? 0,
      assemblySelfWeightLb: sizingSelfWeightLb,
      reachMeters: design.task.reachMeters ?? 0.65,
      safetyFactor: design.task.safetyFactorMin ?? 2,
    });
  }, [activeAssembly, design, sizingSelfWeightLb]);
  const loadSizingHighlights = useMemo(() => {
    const rank: Record<RobotArmLoadFindingStatus, number> = { ok: 0, watch: 1, undersized: 2 };
    const highlights: Record<string, RobotArmLoadFindingStatus> = {};
    for (const finding of loadSizingResult?.findings ?? []) {
      if (!finding.partId) continue;
      const current = highlights[finding.partId];
      if (!current || rank[finding.status] > rank[current]) highlights[finding.partId] = finding.status;
    }
    return highlights;
  }, [loadSizingResult]);
  const selectedLoadSizingFinding = useMemo(() => {
    const rank: Record<RobotArmLoadFindingStatus, number> = { ok: 0, watch: 1, undersized: 2 };
    return loadSizingResult?.findings
      .filter((finding) => finding.partId === selectedPart?.id)
      .sort((left, right) => rank[right.status] - rank[left.status] || (right.utilization ?? 0) - (left.utilization ?? 0))[0];
  }, [loadSizingResult, selectedPart?.id]);
  const selectedPartOutputPreview = useMemo(() => (
    selectedPart ? buildPartOutputPreview(selectedPart, design?.units ?? 'mm', design?.task ?? mockReferenceDesign.task, loadSizingResult, selectedLoadSizingFinding) : null
  ), [design?.task, design?.units, loadSizingResult, selectedLoadSizingFinding, selectedPart]);

  const selectPart = (partId: string) => {
    setSelectedPartId(partId);
    setSubstitutionPreview(null);
    setFocusedPartId((current) => current == null ? current : partId);
    setActiveCanvasDrawer('part');
    setAuthoringMessage(`Selected ${activeAssembly?.parts.find((part) => part.id === partId)?.name ?? partId} for contextual visual editing beside the 3D plane.`);
    markDemoStep('select-part');
  };

  const selectMaterialOption = (optionId: string) => {
    setSelectedOptionId(optionId);
    setSubstitutionPreview(null);
  };

  const selectAssembly = (assemblyId: string) => {
    const assembly = design?.assemblies.find((candidate) => candidate.id === assemblyId);
    if (!assembly) return;
    setSelectedAssemblyId(assembly.id);
    selectPart(assembly.parts[0]?.id ?? '');
  };

  const commitAuthoredProject = (
    project: BackendProject,
    options: { selectedAssemblyId?: string; selectedPartId?: string; message?: string } = {},
  ) => {
    if (!design) return;
    const nextDesign = remapDesignFromProject(design, project);
    setDesign(nextDesign);
    const nextAssemblyId = options.selectedAssemblyId ?? selectedAssemblyId;
    const nextAssembly = nextDesign.assemblies.find((assembly) => assembly.id === nextAssemblyId) ?? nextDesign.assembly;
    setSelectedAssemblyId(nextAssembly.id);
    setSelectedPartId(options.selectedPartId ?? nextAssembly.parts[0]?.id ?? '');
    setSubstitutionPreview(null);
    if (options.message) setAuthoringMessage(options.message);
    rememberRecentProject(nextDesign, intentText, referenceImages);
  };

  const changeProjectUnits = (units: AuthoringUnit) => {
    if (!design) return;
    commitAuthoredProject(updateProjectUnits(design.backendProject, units), {
      selectedPartId: selectedPart?.id,
      message: `Project units changed to ${unitOptions.find((option) => option.value === units)?.label ?? units}. Geometry remains stored in millimeters inside the project file.`,
    });
  };

  const updateSelectedPartGeometry = (updates: Parameters<typeof updatePartGeometry>[2], message?: string) => {
    if (!design || !selectedPart) return;
    commitAuthoredProject(updatePartGeometry(design.backendProject, selectedPart.id, updates), {
      selectedPartId: selectedPart.id,
      message: message ?? `${selectedPart.name} geometry updated on the visual CAD canvas. Mass and engineering ratings remain review-required.`,
    });
  };

  const updateSelectedDimension = (key: 'length' | 'width' | 'height' | 'diameter', rawValue: string) => {
    if (!design || !selectedPart) return;
    const draftKey = `${selectedPart.id}:${design.units}:${key}`;
    setDimensionDrafts((current) => ({ ...current, [draftKey]: rawValue }));
    if (rawValue.trim() === '') return;
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return;
    const valueMm = lengthToMm(numericValue, design.units);
    const dimensions = key === 'length'
      ? { lengthMm: valueMm }
      : key === 'width'
        ? { widthMm: valueMm }
        : key === 'height'
          ? { heightMm: valueMm }
          : { diameterMm: valueMm };
    updateSelectedPartGeometry({ dimensions }, `${selectedPart.name} ${key} set to ${rawValue} ${design.units}.`);
    markDemoStep('viewport-edit');
  };

  const updateSelectedHolePattern = (updates: Partial<PartAuthoringHolePattern>, message?: string) => {
    if (!design || !selectedPart) return;
    const holePattern = normalizeHolePattern(selectedPart, updates);
    const fasteners = [holePattern.fastenerSpec, ...selectedPart.fasteners.filter((fastener) => fastener !== holePattern.fastenerSpec)].slice(0, 6);
    updateSelectedPartGeometry({ holePattern, fasteners }, message ?? `${selectedPart.name} hole pattern set to ${formatLength(holePattern.offsetFromBottomMm, design.units)} from the bottom and ${holePattern.centeredOnWidth ? 'centered' : 'offset'} with ${holePattern.fastenerLabel}.`);
    markDemoStep('viewport-edit');
  };

  const updateSelectedSketchState = (updates: Partial<PartAuthoringSketchState>, message?: string) => {
    if (!design || !selectedPart) return;
    const base = selectedPart.authoring.sketchState ?? defaultSketchStateForPart(selectedPart);
    const sketchState: PartAuthoringSketchState = {
      ...base,
      ...updates,
      notes: updates.notes ?? base.notes,
    };
    updateSelectedPartGeometry({ sketchState, featureRecipe: recipeFromSketchState(selectedPart, sketchState) }, message ?? `${selectedPart.name} ${sketchOperationLabel[sketchState.operation].toLowerCase()} updated on ${sketchState.plane}.`);
    markDemoStep('viewport-edit');
  };

  const commitSelectedPartLabel = (rawLabel: string) => {
    if (!design || !selectedPart) return;
    const label = rawLabel.trim();
    setLabelDrafts((current) => {
      const next = { ...current };
      delete next[selectedPart.id];
      return next;
    });
    if (!label) {
      setAuthoringMessage('Add a part label before saving it to the visual model tree and project file.');
      return;
    }
    if (label === selectedPart.name) return;
    updateSelectedPartGeometry({ label }, `${selectedPart.name} label changed to ${label}. The label is stored in the portable project file.`);
  };

  const createPartFromPalette = (kind: CADPrimitiveShape) => {
    if (!design || !activeAssembly) return;
    const created = createPrimitivePart(design.backendProject, activeAssembly.id, kind, selectedPart?.id ?? null);
    if (!created.partId) return;
    commitAuthoredProject(created.project, {
      selectedPartId: created.partId,
      message: `Created ${kind.replaceAll('_', ' ')} primitive on the XYZ workspace. It is editable visual geometry, not generated parametric CAD.`,
    });
    markDemoStep('select-part');
  };

  const createAssemblyFromPalette = () => {
    if (!design) return;
    const created = createAssemblyWithBase(design.backendProject);
    commitAuthoredProject(created.project, {
      selectedAssemblyId: created.assemblyId,
      selectedPartId: created.partId,
      message: 'Created a new visual assembly with a base plate on the XYZ grid. Add links, joints, motors, and wires from the palette.',
    });
    setActiveCanvasDrawer('tools');
  };

  const startBlankPartDesignPlane = () => {
    if (!design || !selectedPart) return;
    const createdAssembly = createAssemblyWithBase(design.backendProject);
    const createdPart = createPrimitivePart(createdAssembly.project, createdAssembly.assemblyId, 'cylinder_joint', null);
    if (!createdPart.partId) return;
    const withoutBase = deleteVisualPart(createdPart.project, createdAssembly.assemblyId, createdAssembly.partId);
    const sketchState: PartAuthoringSketchState = {
      plane: 'Front plane',
      profile: 'Concentric circle profile with bore',
      constraintSummary: 'Blank part plane starts with concentric OD and bore constraints plus editable height.',
      extrudeDepthMm: 72,
      operation: 'sketch',
      notes: ['Blank part design plane created from the full-canvas quick action.'],
    };
    const blankPartSeed: Part = {
      ...selectedPart,
      id: createdPart.partId,
      name: 'Blank sleeve part design plane',
      authoring: {
        ...selectedPart.authoring,
        primitive: 'cylinder_joint',
        featureRecipe: null,
        dimensionsMm: { lengthMm: 72, widthMm: 72, heightMm: 72, diameterMm: 72, thicknessMm: 12 },
      },
    };
    const holePattern = buildDefaultHolePattern(blankPartSeed);
    const labeledProject = updatePartGeometry(withoutBase.project, createdPart.partId, {
      label: 'Blank sleeve part design plane',
      dimensions: { lengthMm: 72, widthMm: 72, heightMm: 72, diameterMm: 72, thicknessMm: 12 },
      position: { x: 0, y: 0, z: 42 },
      sketchState,
      featureRecipe: recipeFromSketchState(blankPartSeed, sketchState),
      holePattern,
      fasteners: [holePattern.fastenerSpec],
    });
    commitAuthoredProject(labeledProject, {
      selectedAssemblyId: createdAssembly.assemblyId,
      selectedPartId: createdPart.partId,
      message: 'Opened a blank part-design plane with one editable sleeve proxy on the full-canvas workspace.',
    });
    setFocusedPartId(createdPart.partId);
    setExplodePercent(0);
    setViewZoom(1.45);
    setViewPan({ x: 0, y: 24 });
    setActiveCanvasDrawer('part');
    markDemoStep('viewport-edit');
  };

  const duplicateSelectedPart = () => {
    if (!design || !activeAssembly || !selectedPart) return;
    const duplicated = duplicatePart(design.backendProject, activeAssembly.id, selectedPart.id);
    if (!duplicated.partId) return;
    commitAuthoredProject(duplicated.project, {
      selectedPartId: duplicated.partId,
      message: `Duplicated ${selectedPart.name} as a safe local visual primitive copy.`,
    });
  };

  const deleteSelectedPart = () => {
    if (!design || !activeAssembly || !selectedPart) return;
    const deleted = deleteVisualPart(design.backendProject, activeAssembly.id, selectedPart.id);
    commitAuthoredProject(deleted.project, {
      selectedPartId: deleted.nextPartId,
      message: deleted.deleted
        ? `Deleted ${selectedPart.name} from the active visual assembly.`
        : 'Delete is limited to visual-authoring parts with no wiring or electronics links so seeded demo evidence is not corrupted.',
    });
  };

  const connectSelectedPart = (parentPartId: string | null, jointType: CADJointType) => {
    if (!design || !selectedPart) return;
    commitAuthoredProject(connectPartToParent(design.backendProject, selectedPart.id, parentPartId, jointType), {
      selectedPartId: selectedPart.id,
      message: parentPartId
        ? `${selectedPart.name} is connected to ${activeAssembly?.parts.find((part) => part.id === parentPartId)?.name ?? parentPartId} with a ${jointType} joint marker.`
        : `${selectedPart.name} is no longer parented in the simple assembly chain.`,
    });
  };

  const routeWireToTarget = () => {
    if (!design || !activeAssembly || !selectedPart || !wireRouteTargetId) return;
    const routed = createWireRoute(design.backendProject, activeAssembly.id, selectedPart.id, wireRouteTargetId);
    if (!routed.routeId) {
      setAuthoringMessage('Choose two different parts in the active assembly before routing a wire harness segment.');
      return;
    }
    commitAuthoredProject(routed.project, {
      selectedPartId: selectedPart.id,
      message: `Created visible wire route ${routed.routeId}. The route is a polyline with heuristic clearance and bend data, not exact electrical validation.`,
    });
    markDownstreamPanelReviewed('wiring');
  };

  const focusSelectedPart = () => {
    if (!selectedPart) return;
    const nextFocus = focusedPartId === selectedPart.id ? null : selectedPart.id;
    setFocusedPartId(nextFocus);
    if (nextFocus) {
      setExplodePercent((value) => Math.max(value, 72));
      setViewZoom((value) => Math.max(value, 1.32));
      setAuthoringMessage(`${selectedPart.name} is in focus: nearby parts are dimmed and the selected geometry lifts away from the assembly. Full exploded transforms remain a FreeCAD-worker follow-up.`);
    } else {
      setAuthoringMessage('Focus cleared. Use explode, orbit, pan, and zoom to inspect the complete assembly context.');
    }
  };

  const changeRequirementPayload = (payloadLb: number) => {
    if (!design || !selectedPart) return;
    commitAuthoredProject(updateProjectTargets(design.backendProject, { payloadLb }), {
      selectedPartId: selectedPart.id,
      message: `Payload requirement set to ${payloadLb} lb. MechaFlow recalculated payload plus machine self-weight and highlighted affected components for review.`,
    });
    markDemoStep('load-resizing');
  };

  const changeRequirementSafetyFactor = (safetyFactor: number) => {
    if (!design || !selectedPart || !Number.isFinite(safetyFactor) || safetyFactor <= 0) return;
    commitAuthoredProject(updateProjectTargets(design.backendProject, { safetyFactor }), {
      selectedPartId: selectedPart.id,
      message: `Safety factor guidance set to ${safetyFactor}. Requirement sizing remains deterministic triage, not certification.`,
    });
    markDemoStep('load-resizing');
  };

  const applyLoadSizingFinding = (finding: RobotArmLoadSizingFinding) => {
    if (!design || !loadSizingResult) return;
    const upgradedProject = applyRobotArmLoadFixesToProject(design.backendProject, [finding], loadSizingResult.requirement);
    commitAuthoredProject(upgradedProject, {
      selectedPartId: finding.partId ?? selectedPart?.id,
      message: finding.fix
        ? `Applied ${finding.fix.label} from the deterministic local upgrade catalog. The part is highlighted for review with updated geometry, fastener, material, or actuator metadata.`
        : `${finding.partName} has no direct local fix. Inspect assumptions and route to engineering review.`,
    });
    if (finding.partId) {
      setFocusedPartId(finding.partId);
      setExplodePercent((value) => Math.max(value, 72));
    }
    markDemoStep('load-resizing');
  };

  const applyAllLoadSizingFixes = () => {
    if (!design || !loadSizingResult || !selectedPart) return;
    const actionable = loadSizingResult.findings.filter((finding) => finding.status === 'undersized' && finding.fix && finding.partId);
    if (actionable.length === 0) {
      setAuthoringMessage('No undersized components have deterministic local fixes for the current requirement. Watch items remain review-required.');
      return;
    }
    const upgradedProject = applyRobotArmLoadFixesToProject(design.backendProject, actionable, loadSizingResult.requirement);
    const firstPartId = actionable[0]?.partId ?? selectedPart.id;
    commitAuthoredProject(upgradedProject, {
      selectedPartId: firstPartId,
      message: `Applied ${actionable.length} deterministic local upgrade${actionable.length === 1 ? '' : 's'} for the ${loadSizingResult.requirement.payloadLb} lb requirement. Recalculate and review remaining watch items before release.`,
    });
    setFocusedPartId(firstPartId);
    setExplodePercent((value) => Math.max(value, 78));
    markDemoStep('load-resizing');
  };

  const applySelectedCatalogMatch = () => {
    if (!design || !selectedPart || !selectedCatalogMatch) return;
    const query = partMatchQuery.trim() || selectedCatalogMatch.item.name;
    const matchedProject = applyCatalogMatchToPart(design.backendProject, selectedPart.id, selectedCatalogMatch.item, { ...selectedCatalogMatch, query });
    commitAuthoredProject(matchedProject, {
      selectedPartId: selectedPart.id,
      message: `Matched "${query}" to ${selectedCatalogMatch.item.name} with ${selectedCatalogMatch.score}% ${selectedCatalogMatch.confidence} confidence. Type, dimensions, material, process, and local catalog reasoning are applied but remain editable.`,
    });
    setSelectedCatalogMatchId(selectedCatalogMatch.item.id);
    markDemoStep('catalog-match');
  };

  const addSelectedCatalogMatchToAssembly = () => {
    if (!design || !activeAssembly || !selectedPart || !selectedCatalogMatch) return;
    const query = partMatchQuery.trim() || selectedCatalogMatch.item.name;
    const created = createPrimitivePart(design.backendProject, activeAssembly.id, selectedCatalogMatch.item.primitive, selectedPart.id);
    if (!created.partId) return;
    const matchedProject = applyCatalogMatchToPart(created.project, created.partId, selectedCatalogMatch.item, { ...selectedCatalogMatch, query });
    commitAuthoredProject(matchedProject, {
      selectedPartId: created.partId,
      message: `Added ${selectedCatalogMatch.item.name} to ${activeAssembly.name} from the local catalog match for "${query}". It is now a selectable assembly part with editable criteria, dimensions, material, process, and wiring handoff metadata.`,
    });
    setSelectedCatalogMatchId(selectedCatalogMatch.item.id);
    setFocusedPartId(created.partId);
    setExplodePercent((value) => Math.max(value, 72));
    markDemoStep('catalog-match');
  };

  const changeGuidedPartQuery = (query: string) => {
    setGuidedPartQuery(query);
    setGuidedCatalogMatchId('');
  };

  const syncGuidedMatchToCatalogPanel = () => {
    if (!selectedGuidedMatch) return;
    setPartMatchQuery(guidedPartQuery);
    setSelectedCatalogMatchId(selectedGuidedMatch.item.id);
    markDemoStep('catalog-match');
  };

  const applyGuidedRecipeToSelected = () => {
    if (!design || !selectedPart || !selectedGuidedMatch) return;
    const query = guidedPartQuery.trim() || selectedGuidedMatch.item.name;
    const matchedProject = applyCatalogMatchToPart(design.backendProject, selectedPart.id, selectedGuidedMatch.item, { ...selectedGuidedMatch, query });
    commitAuthoredProject(matchedProject, {
      selectedPartId: selectedPart.id,
      message: `Guided flow applied ${selectedGuidedMatch.item.name} to the selected part from "${query}". Sketch profile, dimensions, feature recipe, material, process, and local match reasoning are now editable project metadata.`,
    });
    setPartMatchQuery(query);
    setSelectedCatalogMatchId(selectedGuidedMatch.item.id);
    setFocusedPartId(selectedPart.id);
    setExplodePercent((value) => Math.max(value, 72));
    markDemoStep('guided-authoring');
    markDemoStep('catalog-match');
  };

  const placeGuidedRecipeInAssembly = () => {
    if (!design || !activeAssembly || !selectedPart || !selectedGuidedMatch) return;
    const query = guidedPartQuery.trim() || selectedGuidedMatch.item.name;
    const created = createPrimitivePart(design.backendProject, activeAssembly.id, selectedGuidedMatch.item.primitive, selectedPart.id);
    if (!created.partId) return;
    const matchedProject = applyCatalogMatchToPart(created.project, created.partId, selectedGuidedMatch.item, { ...selectedGuidedMatch, query });
    const placedProject = updatePartGeometry(matchedProject, created.partId, {
      position: {
        x: selectedPart.authoring.positionMm.x + 118,
        y: selectedPart.authoring.positionMm.y + 28,
        z: selectedPart.authoring.positionMm.z + 30,
      },
    });
    commitAuthoredProject(placedProject, {
      selectedPartId: created.partId,
      message: `Guided flow placed ${selectedGuidedMatch.item.name} in ${activeAssembly.name} from "${query}". The new part is rendered, selected, dimensioned, and ready for assembly, wiring, and backend handoff review.`,
    });
    setPartMatchQuery(query);
    setSelectedCatalogMatchId(selectedGuidedMatch.item.id);
    setFocusedPartId(created.partId);
    setExplodePercent((value) => Math.max(value, 72));
    markDemoStep('guided-authoring');
    markDemoStep('catalog-match');
  };

  const createProjectFromIntent = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmedIntent = intentText.trim();
    if (!trimmedIntent) {
      setIntentMessage('Type a design intent first, for example payload, reach, cycle time, material, and restrictions.');
      return;
    }
    if (!design) return;
    const conceptDesign = JSON.parse(JSON.stringify(mockReferenceDesign)) as ReferenceDesign;
    const conceptTask = taskFromDesignIntent(conceptDesign.task, trimmedIntent);
    const localBackend = { ...conceptDesign.backend };
    delete localBackend.apiBaseUrl;
    const intentUnits = inferUnitsFromIntent(trimmedIntent, conceptDesign.units);
    const isolatedDesign: ReferenceDesign = isolateOfflineDesign({
      ...conceptDesign,
      id: 'local-design-intent-concept',
      name: 'New mechanism concept from prompt',
      sourceUrl: null,
      license: 'Local concept seed, no external CAD asset',
      formats: ['Prompt intent', 'Reference images metadata', 'Proxy 3D viewport'],
      task: conceptTask,
      backendProject: {
        ...conceptDesign.backendProject,
        id: 'local-design-intent-concept',
        name: 'New mechanism concept from prompt',
        reference_design_id: null,
        active_task: {
          ...(conceptDesign.backendProject.active_task ?? {
            id: 'task-local-design-intent',
            kind: 'lift_payload',
            description: conceptTask.label,
            validation_method: 'heuristic',
            assumptions: [],
          }),
          description: conceptTask.label,
          target_value: conceptTask.targetPayloadLb,
          unit: conceptTask.targetPayloadLb == null ? null : 'lb',
        },
        units: intentUnits,
        analysis_jobs: [],
        reports: [],
      },
      units: intentUnits,
      analysisJobs: [],
      reports: [],
      wiringReview: null,
      backend: {
        ...localBackend,
        projectId: 'local-design-intent-concept',
        source: 'bundled-mock',
        endpoint: 'local visual prompt concept persisted through browser project file export',
        advisoryNotice: 'This project was started from typed design intent. The viewport is an interactive concept proxy until real CAD generation, reconstruction, and FEA workers are connected.',
      },
    }, 'local-design-intent-concept');
    const promptedProject = applyIntentToProjectGeometry(isolatedDesign.backendProject, trimmedIntent, conceptTask.reachMeters, intentUnits);
    const nextDesign = remapDesignFromProject(isolatedDesign, promptedProject);
    applyLoadedDesign(nextDesign);
    rememberRecentProject(nextDesign, trimmedIntent, referenceImages);
    setWorkspaceMode('design');
    setSubstitutionPreview(null);
    setIntentMessage('Started a concept workspace from your prompt. Units and reach prefilled visible geometry on the XYZ grid; this is not generated parametric CAD or photo reconstruction.');
  };

  const loadReadyExample = async (exampleId: ReadyExampleId) => {
    const example = readyExamples.find((candidate) => candidate.id === exampleId);
    const loadedDesign = await loadCockpitDesign();
    const nextDesign = buildReadyExampleDesign(loadedDesign, exampleId);
    applyLoadedDesign(nextDesign);
    setReferenceImages([]);
    rememberRecentProject(nextDesign, example?.intent ?? '', []);
    setWorkspaceMode('design');
    setIntentText(example?.intent ?? '');
    setIntentMessage(`${example?.title ?? 'Ready example'} loaded. Example data is repository-local and does not import external CAD assets.`);
  };

  const openRecentProject = () => {
    const recentProject = readRecentProject();
    if (!recentProject) {
      setWorkspaceMode('design');
      setIntentMessage('No saved recent project is available. Import a local .mfcad.json project or load a ready example to create one.');
      return;
    }
    applyLoadedDesign(recentProject.design);
    setIntentText(recentProject.intentText);
    setReferenceImages(recentProject.referenceImages);
    setWorkspaceMode('design');
    setIntentMessage(`Reopened ${recentProject.design.name} from local recent-project history.`);
    const reopenedProjectVersion = projectLoadVersion.current;
    if (recentProject.design.backend.apiBaseUrl) {
      loadLocalSolverReadiness(recentProject.design.backend.apiBaseUrl)
        .then((readiness) => {
          if (projectLoadVersion.current === reopenedProjectVersion) setSolverReadiness(readiness);
        })
        .catch((error) => {
          console.warn('Local solver readiness endpoint is unavailable after recent-project reopen.', error);
          if (projectLoadVersion.current === reopenedProjectVersion) setSolverReadiness(null);
        });
    }
  };

  const addReferenceImages = (files: FileList | File[], source: ReferenceImageSource) => {
    const incomingFiles = Array.from(files);
    const images = makeReferenceImageRecords(incomingFiles, source);
    if (images.length === 0) {
      setIntentMessage('Add image files such as PNG, JPG, WebP, GIF, BMP, SVG, or AVIF. They are stored as local reference metadata only.');
      return;
    }
    const nextReferenceImages = [...images, ...referenceImages].slice(0, 8);
    setReferenceImages(nextReferenceImages);
    if (design) rememberRecentProject(design, intentText, nextReferenceImages);
    setIntentMessage(`${images.length} reference image${images.length === 1 ? '' : 's'} added. Images guide the concept only; no photo-to-CAD reconstruction is running in this MVP.`);
  };

  const importReferenceImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    event.target.value = '';
    if (files) addReferenceImages(files, 'upload');
  };

  const handleReferenceDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setImageDropActive(false);
    addReferenceImages(event.dataTransfer.files, 'drop');
  };

  const startSpeechInput = () => {
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechState('unsupported');
      setIntentMessage('Voice input uses browser-native speech recognition when available. It is not available here, so type the design intent instead.');
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      speechRecognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript?.trim();
        if (transcript) {
          setIntentText((current) => `${current} ${transcript}`.trim());
          setIntentMessage('Voice intent captured by the browser. Review the extracted chips before starting.');
        }
      };
      recognition.onerror = () => {
        setSpeechState('error');
        setIntentMessage('Speech capture did not complete. Type the design intent or try the browser microphone again.');
      };
      recognition.onend = () => {
        setSpeechState((current) => current === 'listening' ? 'idle' : current);
      };
      recognition.start();
      setSpeechState('listening');
      setIntentMessage('Listening for design intent through browser-native speech recognition.');
    } catch (error) {
      console.warn('Speech input failed to start.', error);
      setSpeechState('error');
      setIntentMessage('Speech capture is unavailable in this browser. Type the design intent instead.');
    }
  };

  const runMaterialSubstitutionAction = async (action: 'preview' | 'apply') => {
    if (!design?.backend.apiBaseUrl || !selectedOption) {
      setSubstitutionMessage('Start the local backend to preview or apply a persisted material substitution. Offline mock data is read-only.');
      return;
    }
    const requestVersion = projectLoadVersion.current;
    setSubstitutionPending(true);
    setSubstitutionMessage(action === 'preview' ? 'Requesting non-persisted substitution preview...' : 'Applying validated substitution to the project...');
    try {
      const result = action === 'preview'
        ? await previewMaterialSubstitution(design.backend.apiBaseUrl, design.backend.projectId, selectedOption)
        : await applyMaterialSubstitution(design.backend.apiBaseUrl, design.backend.projectId, selectedOption);
      if (projectLoadVersion.current !== requestVersion) return;
      if (result.persisted) {
        setDesign(result.design);
        rememberRecentProject(result.design, intentText, referenceImages);
        setSubstitutionPreview(null);
        setSelectedOptionId('');
        setSubstitutionMessage('Applied substitution to the backend project. BOM, manufacturing, readiness, and reports were reloaded from persisted state.');
        markDemoStep('material-substitution');
      } else {
        setSubstitutionPreview(result);
        setSubstitutionMessage('Preview only: BOM, manufacturing, readiness, and reports below show projected effects. Project is unchanged until Apply is clicked.');
        markDemoStep('material-substitution');
      }
    } catch (error) {
      console.warn('Material substitution failed.', error);
      if (projectLoadVersion.current === requestVersion) {
        setSubstitutionPreview(null);
        setSubstitutionMessage(error instanceof Error ? error.message : 'Material substitution failed compatibility validation.');
      }
    } finally {
      if (projectLoadVersion.current === requestVersion) setSubstitutionPending(false);
    }
  };

  const runSelectedPartPreSolver = async () => {
    if (!design?.backend.apiBaseUrl || !selectedPart) {
      setAnalysisRunMessage('Start the local backend with VITE_API_BASE_URL to run a persisted pre-solver job.');
      return;
    }
    const requestVersion = projectLoadVersion.current;
    setAnalysisRunPending(true);
    setAnalysisRunMessage('Running local pre-solver screening...');
    try {
      const job = await runLocalPreSolverAnalysis(
        design.backend.apiBaseUrl,
        design.backend.projectId,
        selectedPart.id,
      );
      if (projectLoadVersion.current !== requestVersion) return;
      const nextDesign = {
        ...design,
        analysisJobs: [job, ...design.analysisJobs.filter((candidate) => candidate.id !== job.id)],
      };
      setDesign(nextDesign);
      rememberRecentProject(nextDesign, intentText, referenceImages);
      setAnalysisRunMessage('Local pre-solver job completed. Artifact is review-required and not FEA.');
      if (isSuccessfulLocalAnalysisJob(job)) markDemoStep('local-analysis');
    } catch (error) {
      console.warn('Local pre-solver run failed.', error);
      if (projectLoadVersion.current === requestVersion) {
        setAnalysisRunMessage('Local pre-solver job failed. Check the backend status and review-required details.');
      }
    } finally {
      if (projectLoadVersion.current === requestVersion) setAnalysisRunPending(false);
    }
  };

  const runSelectedPartSolverReadiness = async () => {
    if (!design?.backend.apiBaseUrl || !selectedPart) {
      setAnalysisRunMessage('Start the local backend with VITE_API_BASE_URL to run the solver-readiness fixture.');
      return;
    }
    const requestVersion = projectLoadVersion.current;
    setAnalysisRunPending(true);
    setAnalysisRunMessage('Running local solver-readiness fixture or preparing unavailable-tool artifacts...');
    try {
      const job = await runLocalSolverReadinessAnalysis(
        design.backend.apiBaseUrl,
        design.backend.projectId,
        selectedPart.id,
      );
      if (projectLoadVersion.current !== requestVersion) return;
      const nextDesign = {
        ...design,
        analysisJobs: [job, ...design.analysisJobs.filter((candidate) => candidate.id !== job.id)],
      };
      setDesign(nextDesign);
      rememberRecentProject(nextDesign, intentText, referenceImages);
      const refreshed = await loadLocalSolverReadiness(design.backend.apiBaseUrl);
      if (projectLoadVersion.current !== requestVersion) return;
      setSolverReadiness(refreshed);
      setAnalysisRunMessage(
        job.status === 'solver-unavailable'
          ? 'Solver-readiness fixture prepared input artifacts, but CalculiX is unavailable. Install tools before a real fixture run.'
          : job.status === 'complete'
            ? 'Solver-readiness fixture completed with real CalculiX execution. It is still not project FEA.'
            : 'Solver-readiness fixture needs review. Inspect logs and artifact manifests below.',
      );
      if (isSuccessfulLocalAnalysisJob(job)) {
        if (job.status === 'complete' && refreshed.status === 'ready_to_execute_fixture') {
          markDemoStep('solver-readiness');
        }
        markDemoStep('local-analysis');
      }
    } catch (error) {
      console.warn('Local solver-readiness fixture failed.', error);
      if (projectLoadVersion.current === requestVersion) {
        setAnalysisRunMessage('Local solver-readiness fixture failed. Check logs and review-required details.');
      }
    } finally {
      if (projectLoadVersion.current === requestVersion) setAnalysisRunPending(false);
    }
  };

  const exportCurrentProjectFile = async () => {
    if (!design) return;
    const requestVersion = projectLoadVersion.current;
    setProjectFilePending(true);
    setProjectFileMessage('Preparing portable MechaFlow project file from the current visual model...');
    try {
      const projectFile = buildLocalProjectFile(design);
      const blob = new Blob([JSON.stringify(projectFile, null, 2)], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${projectFile.project.id}.mfcad.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      if (projectLoadVersion.current === requestVersion) {
        setExportedEvidence({
          projectId: projectFile.project.id,
          jobIds: projectFile.project.analysis_jobs.map((job) => job.id),
          artifactIds: projectFile.project.analysis_jobs.flatMap((job) => job.artifacts.flatMap((artifact) => (artifact.id ? [artifact.id] : []))),
          artifactContent: evidenceArtifactSignature(projectFile.project.analysis_jobs.flatMap((job) => job.artifacts)),
        });
        setProjectFileMessage(`Exported ${projectFile.project.name} as ${link.download}. Re-import it to verify units, visual parts, assemblies, equipment, wiring, and analysis evidence.`);
        markDemoStep('export-import');
      }
    } catch (error) {
      console.warn('Project export failed.', error);
      if (projectLoadVersion.current === requestVersion) {
        setProjectFileMessage('Project export failed. Check the current local visual project state.');
      }
    } finally {
      if (projectLoadVersion.current === requestVersion) setProjectFilePending(false);
    }
  };

  const importCurrentProjectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const currentDesign = design;
    if (!currentDesign) return;
    const requestVersion = importRequestVersion.current + 1;
    importRequestVersion.current = requestVersion;
    setProjectFilePending(true);
    setProjectFileMessage(`Opening ${file.name}...`);
    try {
      const text = await file.text();
      const projectFile = JSON.parse(text) as unknown;
      const importedDesign = currentDesign.backend.apiBaseUrl
        ? await importProjectFile(currentDesign.backend.apiBaseUrl, projectFile)
        : importLocalProjectFile(projectFile);
      if (importRequestVersion.current !== requestVersion) return;
      const importedJobIds = new Set(importedDesign.analysisJobs.map((job) => job.id));
      const importedArtifacts = importedDesign.analysisJobs.flatMap((job) => job.artifacts);
      const importedArtifactIds = new Set(importedArtifacts.map((artifact) => artifact.id));
      const roundTripVerified = exportedEvidence != null
        && exportedEvidence.projectId === importedDesign.backend.projectId
        && exportedEvidence.jobIds.length > 0
        && exportedEvidence.artifactIds.length > 0
        && exportedEvidence.jobIds.every((jobId) => importedJobIds.has(jobId))
        && exportedEvidence.artifactIds.every((artifactId) => importedArtifactIds.has(artifactId))
        && exportedEvidence.artifactContent === evidenceArtifactSignature(importedArtifacts);
      applyLoadedDesign(importedDesign);
      setIntentText('');
      setReferenceImages([]);
      rememberRecentProject(importedDesign, '', []);
      setProjectFileMessage(`Opened ${importedDesign.name} from ${file.name}.`);
      if (roundTripVerified) markDemoStep('export-import');
      const importedProjectVersion = projectLoadVersion.current;
      if (importedDesign.backend.apiBaseUrl) {
        loadLocalSolverReadiness(importedDesign.backend.apiBaseUrl)
          .then((readiness) => {
            if (importRequestVersion.current === requestVersion && projectLoadVersion.current === importedProjectVersion) {
              setSolverReadiness(readiness);
            }
          })
          .catch((error) => {
            console.warn('Local solver readiness endpoint is unavailable after import.', error);
            if (importRequestVersion.current === requestVersion && projectLoadVersion.current === importedProjectVersion) {
              setSolverReadiness(null);
            }
          });
      }
    } catch (error) {
      console.warn('Project import failed.', error);
      const message = error instanceof SyntaxError
        ? 'Project import failed: file is not valid JSON.'
        : 'Project import failed: malformed or unsupported MechaFlow project file.';
      if (importRequestVersion.current === requestVersion) setProjectFileMessage(message);
    } finally {
      if (importRequestVersion.current === requestVersion) setProjectFilePending(false);
    }
  };

  if (!design) {
    return <main className="loading-shell">Loading MechaFlow cockpit...</main>;
  }

  if (!activeAssembly || !selectedPart) {
    return (
      <main className="loading-shell">
        <section className="empty-state panel" aria-live="polite">
          <p className="eyebrow">Project loaded</p>
          <h1>Assembly review required</h1>
          <p>{design.name} has no selectable parts. Add an assembly part before opening the CAD cockpit.</p>
          <small>
            Data source: {design.backend.source.replaceAll('-', ' ')} via {design.backend.endpoint}
          </small>
        </section>
      </main>
    );
  }

  const activeRating = selectedOption
    ? {
        payloadLb: selectedOption.payloadLb,
        safetyFactor: selectedOption.safetyFactor,
        status: selectedOption.status,
        summary: selectedOption.taskImpact,
      }
    : selectedPart.rating;
  const visibleDesign = substitutionPreview?.design ?? design;
  const selectedRouteIds = new Set(selectedPart.relatedWires);
  const authoringWireRoutes = [...visibleDesign.wiringRoutes]
    .sort((a, b) => {
      const score = (route: ReferenceDesign['wiringRoutes'][number]) => (
        (route.connectedParts.includes(selectedPart.id) ? 2 : 0) + (selectedRouteIds.has(route.id) ? 2 : 0)
      );
      return score(b) - score(a);
    })
    .slice(0, 6);
  const visibleBomTotal = totalBomCost(visibleDesign.bom);
  const hasBomManufacturingWiring = visibleDesign.bom.length > 0
    && visibleDesign.manufacturingOptions.length > 0
    && visibleDesign.electronicsComponents.length > 0
    && (visibleDesign.wiringRoutes.length > 0 || visibleDesign.wiringReview != null);
  const hasCachedEvidence = visibleDesign.analysisJobs.some((job) => (
    job.cachedArtifactRefs.length > 0
    || job.cachedReportRefs.length > 0
    || job.artifacts.length > 0
  )) || visibleDesign.reports.length > 0;
  const hasLocalAnalysisRun = design.analysisJobs.some((job) => (
    isSuccessfulLocalAnalysisJob(job)
  ));
  const hasExportOrImport = demoStepReviews.has('export-import');
  const demoGuideSteps: DemoGuideStep[] = [
    {
      id: 'open-reference',
      label: 'Open reference robot',
      status: 'complete',
      summary: `${design.name} is loaded from ${design.backend.source.replaceAll('-', ' ')} with project ${design.backend.projectId}.`,
      anchor: '#project-browser',
      actionLabel: 'Review project source',
    },
    {
      id: 'guided-authoring',
      label: 'Guided sketch-first part flow',
      status: demoStepReviews.has('guided-authoring') ? 'complete' : 'available',
      summary: 'Describe an approximate part, select units, review a sketch/profile/dimension/feature recipe, match it locally, and place it in the robot arm assembly.',
      anchor: '#guided-part-studio',
      actionLabel: 'Open guided flow',
      canMarkReviewed: true,
    },
    {
      id: 'viewport-edit',
      label: 'Edit dimensions in the 3D viewport',
      status: demoStepReviews.has('viewport-edit') ? 'complete' : 'available',
      summary: `${selectedPart.name} has viewport-anchored dimension, sketch, hole, fastener, material, drawing, and FEA-input controls beside the 3D plane.`,
      anchor: '#viewport-selected-editor',
      actionLabel: 'Open viewport editor',
      canMarkReviewed: true,
    },
    {
      id: 'load-resizing',
      label: 'Resize from 50 lb to 75 lb',
      status: demoStepReviews.has('load-resizing') ? 'complete' : loadSizingResult?.summaryStatus === 'undersized' ? 'available' : 'review',
      summary: loadSizingResult
        ? `Payload plus ${loadSizingResult.requirement.assemblySelfWeightLb} lb self-weight creates a ${loadSizingResult.designReviewLoadLb} lb review load; ${loadSizingResult.undersizedCount} component check${loadSizingResult.undersizedCount === 1 ? '' : 's'} need local upgrades.`
        : 'Open a visual assembly to run deterministic requirement sizing.',
      anchor: '#requirement-sizing-panel',
      actionLabel: 'Open sizing panel',
      canMarkReviewed: Boolean(loadSizingResult),
    },
    {
      id: 'select-part',
      label: 'Select and inspect parts',
      status: demoStepReviews.has('select-part') ? 'complete' : 'available',
      summary: `${activeAssembly.parts.length} selectable mechanical and electrical parts are available in ${activeAssembly.name}.`,
      anchor: '#assembly-viewer',
      actionLabel: 'Open viewer',
      canMarkReviewed: true,
    },
    {
      id: 'catalog-match',
      label: 'Match an unknown part name',
      status: demoStepReviews.has('catalog-match') ? 'complete' : 'available',
      summary: `${localRobotArmPartCatalog.length} local robot-arm catalog items can explain labels such as joint motor, servo actuator, round arm connector, arm link, gripper bracket, and base plate.`,
      anchor: '#catalog-match-editor',
      actionLabel: 'Open catalog match',
      canMarkReviewed: true,
    },
    {
      id: 'material-substitution',
      label: 'Try material substitution',
      status: demoStepReviews.has('material-substitution')
        ? 'complete'
        : materialOptions.length > 0 ? 'available' : 'review',
      summary: materialOptions.length > 0
        ? `${materialOptions.length} compatible, review-required material or process options are available for ${selectedPart.name}.`
        : `${selectedPart.name} has no compatible substitution option in the seed data.`,
      anchor: '#part-inspector',
      actionLabel: 'Open material controls',
      canMarkReviewed: materialOptions.length > 0,
    },
    {
      id: 'bom-wiring-manufacturing',
      label: 'Review BOM, manufacturing, and wiring',
      status: demoStepReviews.has('bom-wiring-manufacturing')
        ? 'complete'
        : hasBomManufacturingWiring ? 'available' : 'review',
      summary: hasBomManufacturingWiring
        ? 'BOM ranges, make or buy options, harness routes, and electronics records are loaded with estimate and heuristic labels.'
        : 'One or more downstream workflow panels need seed or backend data before MVP coverage is complete.',
      anchor: '#bom-panel',
      actionLabel: 'Open downstream panels',
      canMarkReviewed: hasBomManufacturingWiring
        && downstreamPanelsReviewed.bom
        && downstreamPanelsReviewed.manufacturing
        && downstreamPanelsReviewed.wiring,
    },
    {
      id: 'solver-readiness',
      label: 'Check solver readiness',
      status: demoStepReviews.has('solver-readiness')
        ? 'complete'
        : solverReadiness?.status === 'ready_to_execute_fixture' ? 'available' : 'review',
      summary: solverReadiness
        ? `${solverReadiness.summary} Full project FEA remains review-required unless a real solver result is present.`
        : 'Selected part readiness is visible, but local solver tool detection needs a connected backend.',
      anchor: '#analysis-queue',
      actionLabel: 'Open analysis queue',
      canMarkReviewed: solverReadiness?.status === 'ready_to_execute_fixture',
    },
    {
      id: 'local-analysis',
      label: 'Run local-safe analysis path',
      status: hasLocalAnalysisRun
        ? 'complete'
        : design.backend.apiBaseUrl ? 'available' : 'unavailable',
      summary: design.backend.apiBaseUrl
        ? 'Use pre-solver screening or the CalculiX fixture boundary. These paths produce review-required artifacts and never claim project FEA.'
        : 'Connect the desktop mock API or FastAPI backend to run local-safe analysis actions.',
      anchor: '#analysis-queue',
      actionLabel: 'Run safe local path',
    },
    {
      id: 'cached-evidence',
      label: 'Inspect cached evidence and reports',
      status: demoStepReviews.has('cached-evidence')
        ? 'complete'
        : hasCachedEvidence ? 'available' : 'review',
      summary: hasCachedEvidence
        ? 'Cached artifact references and advisory reports are present. Stale or metadata-only files remain honestly labeled.'
        : 'No cached report or artifact evidence is available for this project yet.',
      anchor: '#reports-panel',
      actionLabel: 'Open reports',
      canMarkReviewed: hasCachedEvidence,
    },
    {
      id: 'export-import',
      label: 'Export or reopen evidence',
      status: hasExportOrImport ? 'complete' : 'available',
      summary: 'Export a .mfcad.json visual project package, then import it again to prove units, parts, assemblies, wiring, and evidence survive the round trip.',
      anchor: '#project-file-controls',
      actionLabel: 'Open file controls',
    },
  ];

  const openDemoGuideStep = (step: DemoGuideStep) => {
    const mode: WorkspaceMode = step.id === 'bom-wiring-manufacturing'
      ? 'manufacturing'
      : ['solver-readiness', 'local-analysis'].includes(step.id)
        ? 'analysis'
        : ['cached-evidence', 'export-import'].includes(step.id)
          ? 'reports'
          : 'design';
    setWorkspaceMode(mode);
    window.setTimeout(() => document.querySelector(step.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  const activeMode = workspaceModes.find((mode) => mode.id === workspaceMode) ?? workspaceModes[0];

  return (
    <main className={`app-shell input-first-shell full-canvas-shell canvas-drawer-${activeCanvasDrawer}`}>
      <header className="workspace-topbar">
        <div className="brand-block">
          <span className="app-mark" aria-hidden="true">MF</span>
          <div>
            <p className="eyebrow">MechaFlow CAD</p>
            <h1>Author a visual robot or machine on the XYZ grid.</h1>
            <p>
              Choose units, create editable 3D primitives, assemble a robot arm or machine, place motors and connectors,
              route visible wiring, then export or import the authored project data.
            </p>
          </div>
        </div>
        <nav className="tool-rail" aria-hidden="true" aria-label="Workspace tool modes">
          {workspaceModes.map((mode) => (
            <button
              aria-pressed={workspaceMode === mode.id}
              className={workspaceMode === mode.id ? 'active' : ''}
              tabIndex={-1}
              key={mode.id}
              onClick={() => setWorkspaceMode(mode.id)}
              title={mode.summary}
              type="button"
            >
              <span>{mode.label}</span>
            </button>
          ))}
        </nav>
        <div className="task-card cockpit-task-card" aria-label="Active task">
          <span>Active task</span>
          <strong>{design.task.label}</strong>
          <small>{summarizeTask(design)}</small>
          <small>Data source: {design.backend.source.replaceAll('-', ' ')} via {design.backend.endpoint}</small>
        </div>
      </header>

      <FullCanvasActionBar
        activeDrawer={activeCanvasDrawer}
        activeMode={workspaceMode}
        onBlankPart={startBlankPartDesignPlane}
        onDrawerChange={setActiveCanvasDrawer}
        onModeChange={setWorkspaceMode}
        selectedPartName={selectedPart.name}
      />

      <section className={`project-cockpit full-canvas-cockpit canvas-drawer-${activeCanvasDrawer}`} aria-label="Full-canvas contextual CAD cockpit">
        <aside className="panel cad-sidebar project-browser" id="project-browser" aria-label="Project and example browser">
          <p className="eyebrow">Project browser</p>
          <h2>Start small</h2>
          <p className="sidebar-copy">Create from a prompt, open a saved .mfcad file, or load a local seed, then keep authoring directly on the canvas.</p>
          <div className="quick-start-stack">
            <button className="primary-start" onClick={() => createProjectFromIntent()} type="button">
              <span>New from prompt</span>
              <small>Parses units and reach, then pre-fills editable visual geometry.</small>
            </button>
            <label className={`open-project-button ${projectFilePending ? 'disabled' : ''}`}>
              <span>Open local project</span>
              <small>{design.backend.apiBaseUrl ? '.mfcad JSON through the local API' : '.mfcad JSON opens locally in this browser'}</small>
              <input
                accept=".mfcad.json,application/json"
                aria-label="Open existing MechaFlow project file"
                disabled={projectFilePending}
                onChange={importCurrentProjectFile}
                type="file"
              />
            </label>
            <button className="secondary-start" onClick={openRecentProject} type="button">
              <span>Recent project</span>
              <small>{design.name}</small>
            </button>
          </div>
          {projectFileMessage ? <p className="project-file-message" aria-live="polite">{projectFileMessage}</p> : null}

          <section className="ready-example-list" aria-label="Ready local examples">
            <div className="section-heading-row">
              <h3>Ready examples</h3>
              <small>Local seeds</small>
            </div>
            {readyExamples.map((example) => (
              <article className="example-card" key={example.id}>
                <div>
                  <strong>{example.title}</strong>
                  <p>{example.summary}</p>
                  <small>{example.license}</small>
                </div>
                <button onClick={() => void loadReadyExample(example.id)} type="button">Load</button>
              </article>
            ))}
          </section>

          <details className="model-tree" open>
            <summary>Model tree</summary>
            <div className="backend-summary">
              <strong>{design.name}</strong>
              <small>Project {design.backend.projectId}</small>
              <small>{design.backend.concepts.slice(0, 4).join(', ')}</small>
            </div>
            {selectableAssemblies.length > 1 ? (
              <AssemblySelector
                assemblies={selectableAssemblies}
                selectedAssemblyId={activeAssembly.id}
                onSelect={selectAssembly}
              />
            ) : null}
            <PartTree parts={activeAssembly.parts} selectedPartId={selectedPart.id} onSelect={selectPart} />
          </details>
        </aside>

        <section className="canvas-column" aria-label="3D workspace and command line">
          <section className="viewer-card panel primary-viewer" id="assembly-viewer" aria-label="Interactive visual CAD authoring workspace">
            <div className="viewer-toolbar">
              <div>
                <p className="eyebrow">Visual CAD authoring workspace</p>
                <h2>{activeAssembly.name}</h2>
                <small>Author visible primitives on an XYZ grid: select geometry, edit dimensions, place motors, and route harnesses.</small>
              </div>
              <div className="viewer-controls" aria-label="3D view controls">
                <button type="button" onClick={() => setExplodePercent((value) => (value > 0 ? 0 : 100))}>
                  {explodePercent > 0 ? 'Collapse' : 'Explode'}
                </button>
                <button aria-pressed={focusedPartId === selectedPart.id} type="button" onClick={focusSelectedPart}>
                  {focusedPartId === selectedPart.id ? 'Clear focus' : 'Focus selected'}
                </button>
                <label>
                  <span>Explode</span>
                  <input
                    aria-label="Explode amount"
                    max="100"
                    min="0"
                    onChange={(event) => setExplodePercent(Number(event.target.value))}
                    type="range"
                    value={explodePercent}
                  />
                </label>
                <button type="button" onClick={() => setRotationDeg((value) => value - 15)}>Orbit left</button>
                <label>
                  <span>Yaw</span>
                  <input
                    aria-label="Assembly yaw rotation"
                    max="180"
                    min="-180"
                    onChange={(event) => setRotationDeg(Number(event.target.value))}
                    type="range"
                    value={rotationDeg}
                  />
                </label>
                <button type="button" onClick={() => setRotationDeg((value) => value + 15)}>Orbit right</button>
                <label>
                  <span>Pitch</span>
                  <input
                    aria-label="Assembly orbit pitch"
                    max="68"
                    min="8"
                    onChange={(event) => setOrbitPitchDeg(Number(event.target.value))}
                    type="range"
                    value={orbitPitchDeg}
                  />
                </label>
                <label>
                  <span>Zoom</span>
                  <input
                    aria-label="Canvas zoom"
                    max="1.9"
                    min="0.55"
                    onChange={(event) => setViewZoom(Number(event.target.value))}
                    step="0.05"
                    type="range"
                    value={viewZoom}
                  />
                </label>
                <button type="button" onClick={() => setViewPan((value) => ({ ...value, x: value.x - 32 }))}>Pan left</button>
                <button type="button" onClick={() => setViewPan((value) => ({ ...value, x: value.x + 32 }))}>Pan right</button>
                <button type="button" onClick={() => { setRotationDeg(28); setOrbitPitchDeg(38); setViewZoom(1); setViewPan({ x: 0, y: 0 }); setFocusedPartId(null); }}>Reset view</button>
              </div>
            </div>
            <VisualCadWorkspace
              explodePercent={explodePercent}
              focusedPartId={focusedPartId}
              onNudgeSelected={(delta) => updateSelectedPartGeometry({
                position: {
                  x: selectedPart.authoring.positionMm.x + delta.x,
                  y: selectedPart.authoring.positionMm.y + delta.y,
                  z: Math.max(0, selectedPart.authoring.positionMm.z + delta.z),
                },
              }, `${selectedPart.name} moved on the XYZ grid.`)}
              onSelectPart={selectPart}
              onViewChange={(nextView) => {
                setRotationDeg(nextView.yawDeg);
                setOrbitPitchDeg(nextView.pitchDeg);
                setViewZoom(nextView.zoom);
                setViewPan({ x: nextView.panX, y: nextView.panY });
              }}
              loadHighlights={loadSizingHighlights}
              parts={activeAssembly.parts}
              selectedPartId={selectedPart.id}
              units={design.units}
              view={{ yawDeg: rotationDeg, pitchDeg: orbitPitchDeg, zoom: viewZoom, panX: viewPan.x, panY: viewPan.y }}
              wiringRoutes={visibleDesign.wiringRoutes}
            >
              {selectedPartOutputPreview ? (
                <ViewportAnchoredPartEditor
                  activeTask={design.task}
                  dimensionDrafts={dimensionDrafts}
                  fastenerOptions={fastenerCatalogOptions}
                  loadSizingFinding={selectedLoadSizingFinding}
                  loadSizingResult={loadSizingResult}
                  materials={design.backendProject.materials}
                  onDimensionChange={updateSelectedDimension}
                  onHolePatternChange={updateSelectedHolePattern}
                  onMaterialChange={(materialId) => updateSelectedPartGeometry({ materialId }, `${selectedPart.name} material set from the viewport inspector.`)}
                  onProcessChange={(process) => updateSelectedPartGeometry({ manufacturingProcess: process }, `${selectedPart.name} manufacturing process set to ${process.replaceAll('_', ' ')} from the viewport inspector.`)}
                  onSetCenteredTwoInchHole={() => {
                    const nextPattern = normalizeHolePattern(selectedPart, { offsetFromBottomMm: lengthToMm(2, 'in'), centeredOnWidth: true });
                    updateSelectedHolePattern(nextPattern, `${selectedPart.name} hole pattern set to 2 in from the bottom and centered with ${nextPattern.fastenerLabel}.`);
                  }}
                  onSketchStateChange={updateSelectedSketchState}
                  outputPreview={selectedPartOutputPreview}
                  part={selectedPart}
                  processOptions={selectedPartProcessOptions}
                  processValue={selectedPartProcessValue}
                  units={design.units}
                />
              ) : null}
            </VisualCadWorkspace>
            <SelectedPartCanvasCard
              activeTask={design.task}
              assemblyParts={activeAssembly.parts}
              loadSizingFinding={selectedLoadSizingFinding}
              part={selectedPart}
              selectedOption={selectedOption}
              units={design.units}
            />
            <GuidedPartFlowPanel
              activeUnits={design.units}
              matches={guidedCatalogMatches}
              onApplyToSelected={applyGuidedRecipeToSelected}
              onPlaceInAssembly={placeGuidedRecipeInAssembly}
              onQueryChange={changeGuidedPartQuery}
              onSelectMatch={setGuidedCatalogMatchId}
              onSyncCatalog={syncGuidedMatchToCatalogPanel}
              query={guidedPartQuery}
              selectedMatch={selectedGuidedMatch}
              selectedPartName={selectedPart.name}
            />
            <CanvasToolPalette
              onCreatePart={createPartFromPalette}
              onCreateAssembly={createAssemblyFromPalette}
              selectedPartName={selectedPart.name}
            />
            <div className="viewer-footer">
              <span>
                Visual model: {activeAssembly.parts.length} primitives, {visibleDesign.wiringRoutes.length} harness route{visibleDesign.wiringRoutes.length === 1 ? '' : 's'}, units {design.units}.
              </span>
              <span>Explode {explodePercent}%, orbit yaw {rotationDeg} degrees, pitch {orbitPitchDeg} degrees, zoom {viewZoom.toFixed(2)}. MVP visual primitives are not a parametric CAD kernel.</span>
            </div>
            {authoringMessage ? <p className="authoring-message" aria-live="polite">{authoringMessage}</p> : null}
          </section>

          <section className="command-dock panel" aria-label="Design intent command line">
            <form className="command-form" onSubmit={createProjectFromIntent}>
              <label htmlFor="design-intent-input">Describe what you want to design</label>
              <div className="command-row">
                <input
                  id="design-intent-input"
                  name="design-intent"
                  onChange={(event) => setIntentText(event.target.value)}
                  placeholder="Describe what you want to design..."
                  type="text"
                  value={intentText}
                />
                <button
                  aria-pressed={speechState === 'listening'}
                  className="voice-button"
                  onClick={startSpeechInput}
                  type="button"
                >
                  {speechState === 'listening' ? 'Listening' : 'Speak'}
                </button>
                <button className="submit-command" type="submit">Start design</button>
              </div>
            </form>
            {intentChips.length > 0 ? (
              <div className="intent-chip-list" aria-label="Extracted design intent chips">
                {intentChips.map((chip) => (
                  <span className={`intent-chip kind-${chip.kind}`} key={chip.id} title={chipCopy(chip)}>{chip.label}</span>
                ))}
              </div>
            ) : (
              <div className="intent-chip-list examples" aria-label="Prompt examples">
                {['50 lb payload', '0.65 m reach', '8 s cycle', 'aluminum frame', 'avoid cloud compute', 'serviceable wiring'].map((example) => (
                  <button
                    key={example}
                    onClick={() => setIntentText((current) => `${current} ${example}`.trim())}
                    type="button"
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}
            <section
              className={`reference-dropzone ${imageDropActive ? 'active' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setImageDropActive(true);
              }}
              onDragLeave={() => setImageDropActive(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleReferenceDrop}
              tabIndex={0}
              aria-label="Reference image intake"
            >
              <div>
                <strong>Add reference photos or images</strong>
                <small>Reference only. No photo-to-CAD reconstruction, FEA, quotes, or electrical validation run in this MVP.</small>
              </div>
              <label className="file-import-button reference-upload">
                <span>Upload images</span>
                <input
                  accept="image/avif,image/bmp,image/gif,image/jpeg,image/png,image/svg+xml,image/webp"
                  aria-label="Upload reference images"
                  multiple
                  onChange={importReferenceImages}
                  type="file"
                />
              </label>
            </section>
            {referenceImages.length > 0 ? (
              <ul className="reference-image-list" aria-label="Imported reference image metadata">
                {referenceImages.map((image) => (
                  <li key={image.id}>
                    <strong>{image.name}</strong>
                    <small>{image.sizeLabel} - {image.type} - {image.source} reference, session metadata only</small>
                  </li>
                ))}
              </ul>
            ) : null}
            {intentMessage ? <p className="intent-message" aria-live="polite">{intentMessage}</p> : null}
          </section>

          {workspaceMode === 'design' ? (
            <section className="visual-authoring-dock" aria-label="Visual CAD authoring tools">
              <section className="panel design-overview" aria-label="Design mode summary">
                <p className="eyebrow">Design mode</p>
                <h2>Build the model visually</h2>
                <div className="mode-summary-grid">
                  <div>
                    <strong>{activeAssembly.parts.length}</strong>
                    <span>selectable primitives</span>
                  </div>
                  <div>
                    <strong>{visibleDesign.wiringRoutes.length}</strong>
                    <span>visible wiring routes</span>
                  </div>
                  <div>
                    <strong>{formatLength(selectedPart.authoring.dimensionsMm.lengthMm ?? 0, design.units)}</strong>
                    <span>selected length</span>
                  </div>
                </div>
              </section>

              <section className="panel authoring-panel units-panel" id="units-targets-editor" aria-label="Project units and targets">
                <div className="section-heading-row">
                  <div>
                    <p className="eyebrow">Units and targets</p>
                    <h2>Choose working units</h2>
                  </div>
                  <span className="status-pill status-review_required">local</span>
                </div>
                <label className="field-row compact-field">
                  <span>Units</span>
                  <select aria-label="Project authoring units" onChange={(event) => changeProjectUnits(event.target.value as AuthoringUnit)} value={design.units}>
                    {unitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <div className="authoring-grid two-col">
                  <label className="field-row compact-field">
                    <span>Reach target</span>
                    <input
                      aria-label="Reach target in selected units"
                      min="0"
                      onChange={(event) => commitAuthoredProject(updateProjectTargets(design.backendProject, { reachMm: lengthToMm(Number(event.target.value), design.units) }), {
                        selectedPartId: selectedPart.id,
                        message: `Reach target set to ${event.target.value} ${design.units}.`,
                      })}
                      step="0.01"
                      type="number"
                      value={Number(lengthFromMm(design.task.reachMeters == null ? 0 : design.task.reachMeters * 1000, design.units).toFixed(3))}
                    />
                  </label>
                  <label className="field-row compact-field">
                    <span>Payload lb</span>
                    <input
                      aria-label="Payload target in pounds"
                      min="0"
                      onChange={(event) => commitAuthoredProject(updateProjectTargets(design.backendProject, { payloadLb: Number(event.target.value) }), {
                        selectedPartId: selectedPart.id,
                        message: `Payload target set to ${event.target.value} lb.`,
                      })}
                      step="1"
                      type="number"
                      value={design.task.targetPayloadLb ?? 0}
                    />
                  </label>
                </div>
                <p className="microcopy">Display units are user-selectable; portable project files still store numeric geometry in millimeters for backend consistency.</p>
              </section>

              {loadSizingResult ? (
                <RequirementSizingPanel
                  automaticSelfWeightLb={automaticAssemblySelfWeightLb}
                  onApplyAllFixes={applyAllLoadSizingFixes}
                  onApplyFinding={applyLoadSizingFinding}
                  onPayloadChange={changeRequirementPayload}
                  onSafetyFactorChange={changeRequirementSafetyFactor}
                  onSelectPart={selectPart}
                  onSelfWeightDraftChange={setAssemblySelfWeightDraftLb}
                  result={loadSizingResult}
                  selfWeightDraftLb={assemblySelfWeightDraftLb}
                />
              ) : null}

              <section className="panel authoring-panel" aria-label="Create parts and equipment">
                <div className="section-heading-row">
                  <div>
                    <p className="eyebrow">Create geometry</p>
                    <h2>Primitive palette</h2>
                  </div>
                  <button type="button" onClick={createAssemblyFromPalette}>New assembly</button>
                </div>
                <div className="primitive-palette" aria-label="Visual CAD primitive palette">
                  {([
                    ['base_plate', 'Base'],
                    ['beam', 'Beam'],
                    ['cylinder_joint', 'Joint'],
                    ['bracket', 'Bracket'],
                    ['motor_block', 'Motor'],
                    ['connector', 'Connector'],
                    ['electronics', 'Electronics'],
                    ['tool', 'Tool'],
                  ] as Array<[CADPrimitiveShape, string]>).map(([kind, label]) => (
                    <button key={kind} onClick={() => createPartFromPalette(kind)} type="button">
                      <span className={`primitive-icon primitive-${kind}`} aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
                <div className="authoring-actions">
                  <button type="button" onClick={duplicateSelectedPart}>Duplicate selected</button>
                  <button type="button" onClick={deleteSelectedPart}>Delete visual part</button>
                  <button type="button" onClick={exportCurrentProjectFile}>Export .mfcad</button>
                </div>
              </section>

              <section className="panel authoring-panel part-inspector" id="selected-geometry-editor" aria-label="Selected geometry inspector">
                <div className="section-heading-row">
                  <div>
                    <p className="eyebrow">Selected geometry</p>
                    <strong className="panel-title-like">{selectedPart.name}</strong>
                  </div>
                  <span className={`status-pill status-${selectedPart.analysisReadiness.state.replace(/_/g, '-')}`}>{selectedPart.analysisReadiness.state.replaceAll('_', ' ')}</span>
                </div>
                <label className="field-row compact-field selected-label-field">
                  <span>Label</span>
                  <input
                    aria-label="Selected part label"
                    onBlur={(event) => commitSelectedPartLabel(event.target.value)}
                    onChange={(event) => setLabelDrafts((current) => ({ ...current, [selectedPart.id]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitSelectedPartLabel(event.currentTarget.value);
                      }
                    }}
                    type="text"
                    value={labelDrafts[selectedPart.id] ?? selectedPart.name}
                  />
                </label>
                <div className="authoring-grid three-col">
                  {(selectedPart.authoring.primitive === 'cylinder_joint'
                    ? [['diameter', selectedPart.authoring.dimensionsMm.diameterMm ?? 0], ['height', selectedPart.authoring.dimensionsMm.heightMm ?? 0]]
                    : [['length', selectedPart.authoring.dimensionsMm.lengthMm ?? 0], ['width', selectedPart.authoring.dimensionsMm.widthMm ?? 0], ['height', selectedPart.authoring.dimensionsMm.heightMm ?? 0]]).map(([key, value]) => (
                    <label className="field-row compact-field" key={key}>
                      <span>{key}</span>
                      <input
                        aria-label={`${key} in ${design.units}`}
                        min="0.001"
                        onChange={(event) => updateSelectedDimension(key as 'length' | 'width' | 'height' | 'diameter', event.target.value)}
                        step="0.1"
                        type="number"
                        value={dimensionDrafts[`${selectedPart.id}:${design.units}:${key}`] ?? Number(lengthFromMm(Number(value), design.units).toFixed(3))}
                      />
                    </label>
                  ))}
                  <label className="field-row compact-field">
                    <span>X</span>
                    <input
                      aria-label={`Selected part X position in ${design.units}`}
                      onChange={(event) => updateSelectedPartGeometry({ position: { x: lengthToMm(Number(event.target.value), design.units) } }, `${selectedPart.name} X position updated.`)}
                      step="0.1"
                      type="number"
                      value={Number(lengthFromMm(selectedPart.authoring.positionMm.x, design.units).toFixed(3))}
                    />
                  </label>
                  <label className="field-row compact-field">
                    <span>Y</span>
                    <input
                      aria-label={`Selected part Y position in ${design.units}`}
                      onChange={(event) => updateSelectedPartGeometry({ position: { y: lengthToMm(Number(event.target.value), design.units) } }, `${selectedPart.name} Y position updated.`)}
                      step="0.1"
                      type="number"
                      value={Number(lengthFromMm(selectedPart.authoring.positionMm.y, design.units).toFixed(3))}
                    />
                  </label>
                  <label className="field-row compact-field">
                    <span>Z</span>
                    <input
                      aria-label={`Selected part Z position in ${design.units}`}
                      min="0"
                      onChange={(event) => updateSelectedPartGeometry({ position: { z: lengthToMm(Number(event.target.value), design.units) } }, `${selectedPart.name} Z position updated.`)}
                      step="0.1"
                      type="number"
                      value={Number(lengthFromMm(selectedPart.authoring.positionMm.z, design.units).toFixed(3))}
                    />
                  </label>
                </div>
                <div className="authoring-grid two-col">
                  <label className="field-row compact-field">
                    <span>Shape</span>
                    <input readOnly value={selectedPart.authoring.primitive.replaceAll('_', ' ')} />
                  </label>
                  <label className="field-row compact-field">
                    <span>Rotation Z</span>
                    <input
                      aria-label="Selected part Z rotation in degrees"
                      max="180"
                      min="-180"
                      onChange={(event) => updateSelectedPartGeometry({ rotationZDeg: Number(event.target.value) }, `${selectedPart.name} rotation updated.`)}
                      step="1"
                      type="number"
                      value={selectedPart.authoring.rotationDeg.z}
                    />
                  </label>
                  <label className="field-row compact-field">
                    <span>Material</span>
                    <select
                      aria-label="Selected part material"
                      onChange={(event) => updateSelectedPartGeometry({ materialId: event.target.value }, `${selectedPart.name} material set to ${event.target.options[event.target.selectedIndex]?.text ?? event.target.value}.`)}
                      value={selectedPart.authoring.materialId ?? ''}
                    >
                      {design.backendProject.materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                    </select>
                  </label>
                  <label className="field-row compact-field">
                    <span>Process</span>
                    <select
                      aria-label="Selected part manufacturing process"
                      onChange={(event) => updateSelectedPartGeometry({ manufacturingProcess: event.target.value }, `${selectedPart.name} manufacturing process set to ${event.target.value.replaceAll('_', ' ')}.`)}
                      value={selectedPartProcessValue}
                    >
                      {selectedPartProcessOptions.map((option) => <option key={option.id} value={option.process}>{option.process.replaceAll('_', ' ')}</option>)}
                    </select>
                  </label>
                </div>
                <p className="microcopy">Live dimensions and XYZ coordinates update authored project metadata immediately. Strength, tolerance, mass, and manufacturability remain review-required until real CAD and solver integrations run.</p>
              </section>

              <CatalogMatchPanel
                matches={catalogMatches}
                onAddToAssembly={addSelectedCatalogMatchToAssembly}
                onApplyToSelected={applySelectedCatalogMatch}
                onQueryChange={(query) => {
                  setPartMatchQuery(query);
                  setSelectedCatalogMatchId('');
                }}
                onSelectMatch={setSelectedCatalogMatchId}
                query={partMatchQuery}
                selectedMatch={selectedCatalogMatch}
                selectedPartName={selectedPart.name}
                units={design.units}
              />

              <section className="panel authoring-panel assembly-authoring-panel" id="assembly-authoring-editor" aria-label="Assembly and wiring authoring">
                <div className="section-heading-row">
                  <div>
                    <p className="eyebrow">Assembly and wiring</p>
                    <h2>Connect the robot</h2>
                  </div>
                  <span>{activeAssembly.parts.length} parts</span>
                </div>
                <div className="authoring-grid two-col">
                  <label className="field-row compact-field">
                    <span>Parent</span>
                    <select
                      aria-label="Selected part parent"
                      onChange={(event) => connectSelectedPart(event.target.value || null, selectedPart.authoring.jointType)}
                      value={selectedPart.authoring.parentPartId ?? ''}
                    >
                      <option value="">Unassigned</option>
                      {activeAssembly.parts.filter((part) => part.id !== selectedPart.id).map((part) => <option key={part.id} value={part.id}>{part.name}</option>)}
                    </select>
                  </label>
                  <label className="field-row compact-field">
                    <span>Joint</span>
                    <select
                      aria-label="Selected part joint type"
                      onChange={(event) => connectSelectedPart(selectedPart.authoring.parentPartId, event.target.value as CADJointType)}
                      value={selectedPart.authoring.jointType}
                    >
                      {(['fixed', 'revolute', 'prismatic', 'tool_mount', 'unassigned'] as CADJointType[]).map((joint) => <option key={joint} value={joint}>{joint.replaceAll('_', ' ')}</option>)}
                    </select>
                  </label>
                  <label className="field-row compact-field">
                    <span>Wire to</span>
                    <select aria-label="Wire route target part" onChange={(event) => setWireRouteTargetId(event.target.value)} value={wireRouteTargetId}>
                      <option value="">Choose part</option>
                      {activeAssembly.parts.filter((part) => part.id !== selectedPart.id).map((part) => <option key={part.id} value={part.id}>{part.name}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={routeWireToTarget}>Route visible wire</button>
                </div>
                <ul className="wire-route-list" aria-label="Visible wire routes">
                  {authoringWireRoutes.map((route) => (
                    <li key={route.id}>
                      <strong>{route.name}</strong>
                      <small>{route.wireSegmentIds.length} segment{route.wireSegmentIds.length === 1 ? '' : 's'} - {route.reviewStatus.replaceAll('_', ' ')}</small>
                    </li>
                  ))}
                </ul>
                <p className="microcopy">Wiring routes are intentionally visible in the canvas and portable project JSON. Bend radius, service loops, current, EMI, and collision checks are marked review-required.</p>
              </section>
            </section>
          ) : (
            <section className="mode-deck" aria-label={`${activeMode.label} tools`}>
              <div className="panel mode-deck-heading">
                <p className="eyebrow">{activeMode.label} tools</p>
                <h2>{activeMode.summary}</h2>
                <p>Advanced MVP features stay grouped by mode so the opening cockpit remains calm and 3D-first.</p>
              </div>
              {workspaceMode === 'analysis' ? (
                <AnalysisPanel
                  design={design}
                  onRunPreSolver={runSelectedPartPreSolver}
                  onRunSolverReadiness={runSelectedPartSolverReadiness}
                  runMessage={analysisRunMessage}
                  runPending={analysisRunPending}
                  selectedPart={selectedPart}
                  solverReadiness={solverReadiness}
                />
              ) : null}
              {workspaceMode === 'manufacturing' ? (
                <>
                  <BomPanel design={visibleDesign} onInteract={() => markDownstreamPanelReviewed('bom')} previewActive={Boolean(substitutionPreview)} total={visibleBomTotal} />
                  <ManufacturingPanel design={visibleDesign} onInteract={() => markDownstreamPanelReviewed('manufacturing')} previewActive={Boolean(substitutionPreview)} selectedPartId={selectedPart.id} />
                  <WiringPanel design={visibleDesign} onInteract={() => markDownstreamPanelReviewed('wiring')} selectedPart={selectedPart} />
                </>
              ) : null}
              {workspaceMode === 'reports' ? (
                <>
                  <ReportPanel reports={visibleDesign.reports} selectedOption={substitutionPreview?.option ?? selectedOption} />
                  <ProjectFilePanel
                    canUseProjectFiles={true}
                    message={projectFileMessage}
                    onExport={exportCurrentProjectFile}
                    onImport={importCurrentProjectFile}
                    pending={projectFilePending}
                    projectId={design.backendProject.id}
                  />
                  <DemoGuidePanel onOpenStep={openDemoGuideStep} steps={demoGuideSteps} onMarkReviewed={markDemoStep} />
                </>
              ) : null}
              {workspaceMode === 'backend' ? <BackendContractPanel design={design} /> : null}
            </section>
          )}
        </section>

        <aside className="panel inspector-panel context-sidebar" id="part-inspector" aria-label="Selected-part properties and context tools">
          <p className="eyebrow">Context inspector</p>
          <h2>{selectedPart.name}</h2>
          <p>{selectedPart.purpose}</p>
          <dl className="meta-grid compact">
            <div>
              <dt>Material</dt>
              <dd>
                <span>{selectedPart.material}</span>
                <small className="criterion-source">
                  {materialCriterion?.status ?? 'review-required'} - {materialCriterion?.sourceConfidence ?? 'review-required source'}
                </small>
              </dd>
            </div>
            <div>
              <dt>Process</dt>
              <dd>{selectedPart.manufacturingProcess}</dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>{selectedPart.weightLb == null ? 'Review required' : `${selectedPart.weightLb.toFixed(2)} lb`}</dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd>{selectedPart.costRangeUsd == null ? 'Review required' : formatUsdRange(selectedPart.costRangeUsd)}</dd>
            </div>
            <div>
              <dt>Stress risk</dt>
              <dd>{riskLabel[selectedPart.stressRisk]}</dd>
            </div>
          </dl>
          <CapabilityCard
            rating={activeRating}
            safetyFactorMin={design.task.safetyFactorMin ?? null}
            targetPayloadLb={design.task.targetPayloadLb}
          />
          <details className="context-details">
            <summary>Design and material tools</summary>
            <MaterialSubstitution
              canUseBackend={Boolean(design.backend.apiBaseUrl)}
              message={substitutionMessage}
              onApply={() => runMaterialSubstitutionAction('apply')}
              onPreview={() => runMaterialSubstitutionAction('preview')}
              onSelect={selectMaterialOption}
              options={materialOptions}
              pending={substitutionPending}
              previewActive={Boolean(substitutionPreview)}
              selectedOption={selectedOption}
            />
            <ModificationPreview selectedOption={substitutionPreview?.option ?? selectedOption} />
          </details>
          <details className="context-details">
            <summary>Strength notes</summary>
            <StrengthInfoPanel part={selectedPart} />
          </details>
          <details className="context-details" open={workspaceMode === 'analysis'}>
            <summary>Readiness handoff</summary>
            <PreSolverReadinessPanel readiness={activeAssembly.analysisReadiness} title="Assembly readiness" />
            <PreSolverReadinessPanel readiness={selectedPart.analysisReadiness} title="Part readiness" />
          </details>
        </aside>
      </section>
    </main>
  );
}

function FullCanvasActionBar({
  activeDrawer,
  activeMode,
  onBlankPart,
  onDrawerChange,
  onModeChange,
  selectedPartName,
}: {
  activeDrawer: CanvasDrawer;
  activeMode: WorkspaceMode;
  onBlankPart: () => void;
  onDrawerChange: (drawer: CanvasDrawer) => void;
  onModeChange: (mode: WorkspaceMode) => void;
  selectedPartName: string;
}) {
  const drawerButtons: Array<{ id: CanvasDrawer; label: string; detail: string }> = [
    { id: 'project', label: 'Project', detail: 'open/load/recent' },
    { id: 'part', label: 'Part', detail: selectedPartName },
    { id: 'tools', label: 'Tools', detail: 'sketch/catalog/place' },
    { id: 'requirements', label: 'Load', detail: '50 lb to 75 lb' },
    { id: 'drawing', label: 'Drawing/FEA', detail: 'part outputs' },
    { id: 'assembly', label: 'Assembly', detail: 'joints/wires' },
    { id: 'command', label: 'Command', detail: 'prompt/images' },
    { id: 'context', label: 'Review', detail: 'criteria/readiness' },
  ];
  return (
    <nav className="full-canvas-action-bar" aria-label="Full-canvas contextual actions">
      <div className="canvas-workspace-status">
        <span className="status-dot" aria-hidden="true" />
        <strong>3D modeling plane primary</strong>
        <small>Open contextual pop-outs only when you need project, part, requirement, drawing, or assembly controls.</small>
      </div>
      <button className="blank-plane-action" onClick={onBlankPart} type="button">Start blank part plane</button>
      <div className="canvas-drawer-buttons">
        {drawerButtons.map((button) => (
          <button
            aria-pressed={activeDrawer === button.id}
            key={button.id}
            onClick={() => onDrawerChange(activeDrawer === button.id ? 'none' : button.id)}
            type="button"
          >
            <span>{button.label}</span>
            <small>{button.detail}</small>
          </button>
        ))}
      </div>
      <div className="canvas-mode-switcher" aria-label="Progressive mode switcher">
        {workspaceModes.map((mode) => (
          <button
            aria-pressed={activeMode === mode.id}
            key={mode.id}
            onClick={() => {
              onModeChange(mode.id);
              onDrawerChange(mode.id === 'design' ? 'part' : 'context');
            }}
            type="button"
          >
            {mode.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function ViewportAnchoredPartEditor({
  activeTask,
  dimensionDrafts,
  fastenerOptions,
  loadSizingFinding,
  loadSizingResult,
  materials,
  onDimensionChange,
  onHolePatternChange,
  onMaterialChange,
  onProcessChange,
  onSetCenteredTwoInchHole,
  onSketchStateChange,
  outputPreview,
  part,
  processOptions,
  processValue,
  units,
}: {
  activeTask: ReferenceDesign['task'];
  dimensionDrafts: Record<string, string>;
  fastenerOptions: typeof fastenerCatalogOptions;
  loadSizingFinding?: RobotArmLoadSizingFinding;
  loadSizingResult: RobotArmLoadSizingResult | null;
  materials: BackendMaterial[];
  onDimensionChange: (key: 'length' | 'width' | 'height' | 'diameter', rawValue: string) => void;
  onHolePatternChange: (updates: Partial<PartAuthoringHolePattern>, message?: string) => void;
  onMaterialChange: (materialId: string) => void;
  onProcessChange: (process: string) => void;
  onSetCenteredTwoInchHole: () => void;
  onSketchStateChange: (updates: Partial<PartAuthoringSketchState>, message?: string) => void;
  outputPreview: PartOutputPreview;
  part: Part;
  processOptions: BackendManufacturingOption[];
  processValue: string;
  units: AuthoringUnit;
}) {
  const dimensions = part.authoring.dimensionsMm;
  const holePattern = part.authoring.holePattern ?? buildDefaultHolePattern(part);
  const sketchState = part.authoring.sketchState ?? defaultSketchStateForPart(part);
  const sketchPlanes = viewportSketchPlanes.includes(sketchState.plane) ? viewportSketchPlanes : [sketchState.plane, ...viewportSketchPlanes];
  const sketchProfiles = viewportSketchProfiles.includes(sketchState.profile) ? viewportSketchProfiles : [sketchState.profile, ...viewportSketchProfiles];
  const dimensionFields = part.authoring.primitive === 'cylinder_joint'
    ? [['diameter', dimensions.diameterMm ?? dimensions.widthMm ?? 0], ['height', dimensions.heightMm ?? dimensions.lengthMm ?? 0]] as const
    : [['length', dimensions.lengthMm ?? 0], ['width', dimensions.widthMm ?? dimensions.diameterMm ?? 0], ['height', dimensions.heightMm ?? dimensions.thicknessMm ?? 0]] as const;
  const sketchDepthValue = sketchState.extrudeDepthMm == null ? '' : Number(lengthFromMm(sketchState.extrudeDepthMm, units).toFixed(3));
  return (
    <aside className="viewport-anchored-editor" id="viewport-selected-editor" aria-label="Viewport-anchored selected part editing">
      <div className="viewport-editor-heading">
        <div>
          <p className="eyebrow">Viewport inspector</p>
          <strong>{part.name}</strong>
          <small>Dimension callouts, sketch operations, holes, material, drawing, and FEA inputs stay beside the 3D profile.</small>
        </div>
        <span className="units-badge">{units}</span>
      </div>

      <section className="viewport-editor-section" aria-label="Viewport dimension handles">
        <div className="viewport-section-heading">
          <strong>Editable dimension handles</strong>
          <small>Displayed on the rendered profile</small>
        </div>
        <div className="viewport-dimension-grid">
          {dimensionFields.map(([key, value]) => (
            <label className="field-row compact-field" key={key}>
              <span>{key}</span>
              <input
                aria-label={`Viewport ${key} dimension in ${units}`}
                min="0.001"
                onChange={(event) => onDimensionChange(key, event.target.value)}
                step="0.1"
                type="number"
                value={dimensionDrafts[`${part.id}:${units}:${key}`] ?? Number(lengthFromMm(Number(value), units).toFixed(3))}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="viewport-editor-section" aria-label="Visual sketch and feature operations">
        <div className="viewport-section-heading">
          <strong>Pick plane, sketch, extrude, cut</strong>
          <small>Visual CAD operation metadata</small>
        </div>
        <label className="field-row compact-field">
          <span>Plane</span>
          <select aria-label="Sketch plane for selected part" onChange={(event) => onSketchStateChange({ plane: event.target.value, operation: 'sketch' })} value={sketchState.plane}>
            {sketchPlanes.map((plane) => <option key={plane} value={plane}>{plane}</option>)}
          </select>
        </label>
        <label className="field-row compact-field">
          <span>2D geometry</span>
          <select aria-label="Sketch profile for selected part" onChange={(event) => onSketchStateChange({ profile: event.target.value, operation: 'sketch' })} value={sketchState.profile}>
            {sketchProfiles.map((profile) => <option key={profile} value={profile}>{profile}</option>)}
          </select>
        </label>
        <label className="field-row compact-field">
          <span>Extrude depth</span>
          <input
            aria-label={`Viewport extrude depth in ${units}`}
            min="0.001"
            onChange={(event) => {
              const nextDepth = Number(event.target.value);
              if (Number.isFinite(nextDepth) && nextDepth > 0) onSketchStateChange({ extrudeDepthMm: lengthToMm(nextDepth, units), operation: 'extrude' });
            }}
            step="0.1"
            type="number"
            value={sketchDepthValue}
          />
        </label>
        <div className="viewport-operation-row" aria-label="Sketch operation buttons">
          {(['sketch', 'extrude', 'cut', 'finish'] as const).map((operation) => (
            <button
              aria-pressed={sketchState.operation === operation}
              key={operation}
              onClick={() => onSketchStateChange({ operation }, `${part.name} ${sketchOperationLabel[operation].toLowerCase()} selected from the viewport editor.`)}
              type="button"
            >
              {sketchOperationLabel[operation]}
            </button>
          ))}
        </div>
        <p className="microcopy">{sketchState.constraintSummary}</p>
      </section>

      <section className="viewport-editor-section lifecycle-map-preview" aria-label="CAD lifecycle mapping preview">
        <div className="viewport-section-heading">
          <strong>CAD lifecycle map</strong>
          <small>Public CAD process mapped to MechaFlow data</small>
        </div>
        <div className="lifecycle-map-grid">
          {cadLifecycleMappings.map((mapping) => (
            <article key={mapping.id}>
              <strong>{mapping.publicCadConcept}</strong>
              <small>{mapping.mechaflowMvpRepresentation}</small>
              <small>{mapping.apiAndWorkerBoundary}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="viewport-editor-section" aria-label="Hole and fastener placement from viewport">
        <div className="viewport-section-heading">
          <strong>Hole and fastener logic</strong>
          <small>Example: 2 in from bottom, centered</small>
        </div>
        <label className="field-row compact-field">
          <span>Bolt or screw</span>
          <select
            aria-label="Viewport fastener size"
            onChange={(event) => onHolePatternChange({ fastenerId: event.target.value })}
            value={holePattern.fastenerId}
          >
            {fastenerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="field-row compact-field">
          <span>Bottom offset</span>
          <input
            aria-label={`Viewport hole offset from bottom in ${units}`}
            min="0.001"
            onChange={(event) => {
              const nextOffset = Number(event.target.value);
              if (Number.isFinite(nextOffset) && nextOffset > 0) onHolePatternChange({ offsetFromBottomMm: lengthToMm(nextOffset, units), centeredOnWidth: true });
            }}
            step="0.1"
            type="number"
            value={Number(lengthFromMm(holePattern.offsetFromBottomMm, units).toFixed(3))}
          />
        </label>
        <div className="hole-placement-summary">
          <strong>{holePattern.count}x {formatLength(holePattern.holeDiameterMm, units)} clearance</strong>
          <small>{holePattern.fastenerSpec}; {holePattern.centeredOnWidth ? 'centered on width' : 'offset placement needs review'}.</small>
        </div>
        <button className="viewport-primary-action" onClick={onSetCenteredTwoInchHole} type="button">Set hole 2 in from bottom centered</button>
      </section>

      <section className="viewport-editor-section" aria-label="Viewport material and process controls">
        <div className="viewport-section-heading">
          <strong>Material and process</strong>
          <small>FEA and drawing input metadata</small>
        </div>
        <label className="field-row compact-field">
          <span>Material</span>
          <select aria-label="Viewport selected part material" onChange={(event) => onMaterialChange(event.target.value)} value={part.authoring.materialId ?? ''}>
            {materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
          </select>
        </label>
        <label className="field-row compact-field">
          <span>Process</span>
          <select aria-label="Viewport selected part process" onChange={(event) => onProcessChange(event.target.value)} value={processValue}>
            {processOptions.map((option) => <option key={option.id} value={option.process}>{option.process.replaceAll('_', ' ')}</option>)}
          </select>
        </label>
      </section>

      <section className="viewport-output-preview drawing-preview" id="part-drawing-output" aria-label="Machinist drawing preview">
        <div className="viewport-section-heading">
          <strong>Machinist drawing preview</strong>
          <small>{outputPreview.drawing.drawingNumber}</small>
        </div>
        <dl className="drawing-dimension-list">
          {outputPreview.drawing.dimensions.slice(0, 5).map((dimension) => (
            <div key={dimension.label}>
              <dt>{dimension.label}</dt>
              <dd>{dimension.value}<small>{dimension.note}</small></dd>
            </div>
          ))}
        </dl>
        <ul>
          {outputPreview.drawing.holeCallouts.map((callout) => <li key={callout}>{callout}</li>)}
          {outputPreview.drawing.fastenerCallouts.slice(0, 2).map((callout) => <li key={callout}>Fastener: {callout}</li>)}
          <li>Material: {outputPreview.drawing.material}; process: {outputPreview.drawing.process}.</li>
        </ul>
      </section>

      <section className="viewport-output-preview fea-preview" id="fea-input-preview" aria-label="FEA input preview">
        <div className="viewport-section-heading">
          <strong>FEA input preview</strong>
          <small>{outputPreview.feaInput.units}</small>
        </div>
        <dl className="mini-metric-grid">
          <div>
            <dt>Payload</dt>
            <dd>{activeTask.targetPayloadLb == null ? 'review' : `${formatMeasurement(activeTask.targetPayloadLb)} lb`}</dd>
          </div>
          <div>
            <dt>Self-weight</dt>
            <dd>{loadSizingResult == null ? 'run sizing' : `${formatMeasurement(loadSizingResult.requirement.assemblySelfWeightLb)} lb`}</dd>
          </div>
          <div>
            <dt>Review load</dt>
            <dd>{loadSizingResult == null ? 'review' : `${formatMeasurement(loadSizingResult.designReviewLoadLb)} lb`}</dd>
          </div>
        </dl>
        <p>Payload plus self-weight, material properties, selected fasteners, hole placement, constraints, and sketch dimensions are preserved as pre-solver input metadata.</p>
        <code>{JSON.stringify({ geometry: outputPreview.feaInput.geometry, loads: outputPreview.feaInput.loads, fasteners: outputPreview.feaInput.fasteners.slice(0, 3), constraints: outputPreview.feaInput.constraints.slice(0, 2) }, null, 2)}</code>
        {loadSizingFinding ? <small className={`runner-note status-${loadSizingFinding.status}`}>Selected requirement check: {loadSizingFinding.componentRole} is {loadSizingFinding.status}.</small> : null}
      </section>
    </aside>
  );
}

function RequirementSizingPanel({
  automaticSelfWeightLb,
  onApplyAllFixes,
  onApplyFinding,
  onPayloadChange,
  onSafetyFactorChange,
  onSelectPart,
  onSelfWeightDraftChange,
  result,
  selfWeightDraftLb,
}: {
  automaticSelfWeightLb: number;
  onApplyAllFixes: () => void;
  onApplyFinding: (finding: RobotArmLoadSizingFinding) => void;
  onPayloadChange: (payloadLb: number) => void;
  onSafetyFactorChange: (safetyFactor: number) => void;
  onSelectPart: (partId: string) => void;
  onSelfWeightDraftChange: (value: string) => void;
  result: RobotArmLoadSizingResult;
  selfWeightDraftLb: string;
}) {
  const actionableCount = result.findings.filter((finding) => finding.status === 'undersized' && finding.fix && finding.partId).length;
  const topFindings = result.findings.slice(0, 9);
  const statusCopy: Record<RobotArmLoadFindingStatus, string> = {
    ok: 'Inside local sizing window',
    watch: 'Watch or review',
    undersized: 'Needs deterministic upgrade',
  };
  return (
    <section className={`panel authoring-panel requirement-sizing-panel status-${result.summaryStatus}`} id="requirement-sizing-panel" aria-label="Requirements-driven load resizing">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Requirement sizing triage</p>
          <h2>Resize the robot arm from 50 lb to 75 lb</h2>
        </div>
        <span className={`status-pill status-${result.summaryStatus}`}>{statusCopy[result.summaryStatus]}</span>
      </div>
      <p className="microcopy">
        This deterministic MVP checks target payload plus assembly self-weight against local catalog capacity, torque, fastener, and geometry rules.
        It is not FEA, standards certification, supplier warranty, or a production release decision.
      </p>
      <div className="requirement-controls" aria-label="Requirement load controls">
        <label className="field-row compact-field">
          <span>Payload target</span>
          <input
            aria-label="Requirement payload target in pounds"
            min="0"
            onChange={(event) => onPayloadChange(Number(event.target.value))}
            step="1"
            type="number"
            value={result.requirement.payloadLb}
          />
        </label>
        <label className="field-row compact-field">
          <span>Assembly self-weight</span>
          <input
            aria-label="Assembly self-weight estimate in pounds"
            min="0"
            onChange={(event) => onSelfWeightDraftChange(event.target.value)}
            placeholder={`Auto ${automaticSelfWeightLb} lb`}
            step="0.1"
            type="number"
            value={selfWeightDraftLb}
          />
        </label>
        <label className="field-row compact-field">
          <span>Safety factor</span>
          <input
            aria-label="Requirement safety factor"
            min="1"
            onChange={(event) => onSafetyFactorChange(Number(event.target.value))}
            step="0.1"
            type="number"
            value={result.requirement.safetyFactor}
          />
        </label>
        <div className="requirement-button-row" aria-label="Load demo shortcuts">
          <button onClick={() => onPayloadChange(50)} type="button">Set 50 lb</button>
          <button className="primary-guided-action" onClick={() => onPayloadChange(75)} type="button">Set demo target to 75 lb</button>
          <button disabled={actionableCount === 0} onClick={onApplyAllFixes} type="button">Apply all deterministic fixes</button>
        </div>
      </div>
      <dl className="requirement-metrics" aria-label="Requirement load calculation">
        <div>
          <dt>Working load</dt>
          <dd>{formatMeasurement(result.workingLoadLb)} lb<small>payload plus self-weight</small></dd>
        </div>
        <div>
          <dt>Review load</dt>
          <dd>{formatMeasurement(result.designReviewLoadLb)} lb<small>(payload + self-weight) x safety factor</small></dd>
        </div>
        <div>
          <dt>Shoulder torque</dt>
          <dd>{formatMeasurement(result.effectiveShoulderTorqueNm)} N-m<small>local linkage estimate</small></dd>
        </div>
        <div>
          <dt>Affected checks</dt>
          <dd>{result.undersizedCount} undersized / {result.watchCount} watch<small>{result.impactedPartIds.length} highlighted part{result.impactedPartIds.length === 1 ? '' : 's'}</small></dd>
        </div>
      </dl>
      <div className="load-finding-list" aria-label="Load sizing component findings">
        {topFindings.map((finding) => (
          <article className={`load-finding-card status-${finding.status}`} key={finding.id}>
            <div className="load-finding-heading">
              <div>
                <span>{finding.componentRole}</span>
                <strong>{finding.partName}</strong>
              </div>
              <span className={`status-pill status-${finding.status}`}>{finding.status}</span>
            </div>
            <dl className="mini-metric-grid">
              <div>
                <dt>Required</dt>
                <dd>{formatMeasurement(finding.requiredValue)} {finding.unit}</dd>
              </div>
              <div>
                <dt>Rated</dt>
                <dd>{finding.ratedValue == null ? 'review' : `${formatMeasurement(finding.ratedValue)} ${finding.unit}`}</dd>
              </div>
              <div>
                <dt>Utilization</dt>
                <dd>{finding.utilization == null ? 'unknown' : `${formatMeasurement(finding.utilization * 100, 0)}%`}</dd>
              </div>
            </dl>
            <p>{finding.reason}</p>
            <small>{finding.evidence}</small>
            <div className="load-finding-actions">
              {finding.partId ? <button type="button" onClick={() => onSelectPart(finding.partId!)}>Select part</button> : null}
              {finding.fix ? <button type="button" onClick={() => onApplyFinding(finding)}>{finding.fix.buttonLabel}</button> : null}
            </div>
            {finding.fix ? <small className="runner-note">Catalog-backed fix: {finding.fix.summary}</small> : null}
          </article>
        ))}
      </div>
      <details className="requirement-assumptions">
        <summary>Assumptions and uncertainty</summary>
        <ul>{result.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
      </details>
    </section>
  );
}

function GuidedPartFlowPanel({
  activeUnits,
  matches,
  onApplyToSelected,
  onPlaceInAssembly,
  onQueryChange,
  onSelectMatch,
  onSyncCatalog,
  query,
  selectedMatch,
  selectedPartName,
}: {
  activeUnits: AuthoringUnit;
  matches: LocalPartCatalogMatch[];
  onApplyToSelected: () => void;
  onPlaceInAssembly: () => void;
  onQueryChange: (query: string) => void;
  onSelectMatch: (catalogItemId: string) => void;
  onSyncCatalog: () => void;
  query: string;
  selectedMatch?: LocalPartCatalogMatch;
  selectedPartName: string;
}) {
  const guidedSteps = [
    ['choose', 'Describe or choose role', query.trim() || 'plain language part intent'],
    ['sketch', selectedMatch?.item.featureRecipe ? selectedMatch.item.featureRecipe.history[0]?.label ?? 'Sketch profile' : 'Pick primitive profile', selectedMatch?.item.featureRecipe?.profile ?? selectedMatch?.item.partType ?? 'matched primitive'],
    ['dimension', 'Dimension in viewport', selectedMatch ? `Units ${activeUnits}, ${dimensionSummary({ authoring: { dimensionsMm: selectedMatch.item.defaultDimensionsMm, primitive: selectedMatch.item.primitive } } as Part, activeUnits)}` : `Units ${activeUnits}`],
    ['feature', 'Add feature steps', selectedMatch?.item.featureRecipe ? selectedMatch.item.featureRecipe.history.map((step) => step.label).join(' -> ') : selectedMatch?.item.criteria[0] ?? 'feature review required'],
    ['match', 'Match local catalog', selectedMatch ? `${selectedMatch.item.name} - ${selectedMatch.score}% ${selectedMatch.confidence}` : 'No match yet'],
    ['place', 'Place in assembly', selectedMatch?.item.assemblyRole ?? 'select a matched role first'],
  ];
  const examples = ['lightweight sleeve with diagonal slots', 'round arm connector', 'servo thing', 'joint motor', 'sheet metal gripper bracket'];
  return (
    <section className="guided-part-studio" id="guided-part-studio" aria-label="Guided visual part authoring flow">
      <div className="guided-studio-heading">
        <div>
          <p className="eyebrow">Guided part studio</p>
          <h3>Describe a part, sketch the recipe, then place it in the robot arm</h3>
          <small>SolidWorks-inspired flow: plane, sketch, dimensions, extrude, cut, chamfer, catalog match, assembly handoff.</small>
        </div>
        <span className="units-badge">units {activeUnits}</span>
      </div>
      <label className="guided-query" htmlFor="guided-part-query">
        <span>What part do you want to author?</span>
        <input
          id="guided-part-query"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="lightweight sleeve with diagonal slots"
          type="text"
          value={query}
        />
      </label>
      <div className="guided-example-row" aria-label="Guided part examples">
        {examples.map((example) => <button key={example} onClick={() => onQueryChange(example)} type="button">{example}</button>)}
      </div>
      <ol className="guided-stepper" aria-label="Sketch-first part authoring steps">
        {guidedSteps.map(([id, label, detail], index) => (
          <li key={id}>
            <span>{index + 1}</span>
            <strong>{label}</strong>
            <small>{detail}</small>
          </li>
        ))}
      </ol>
      <div className="guided-match-and-recipe">
        <div className="guided-match-list" aria-label="Guided local matches">
          {matches.map((match) => (
            <button
              aria-pressed={selectedMatch?.item.id === match.item.id}
              className={selectedMatch?.item.id === match.item.id ? 'selected' : ''}
              key={match.item.id}
              onClick={() => onSelectMatch(match.item.id)}
              type="button"
            >
              <strong>{match.item.name}</strong>
              <span>{match.score}% {match.confidence} - {match.item.partType}</span>
            </button>
          ))}
        </div>
        {selectedMatch ? (
          <div className="guided-recipe-card" aria-live="polite">
            <strong>{selectedMatch.item.featureRecipe?.name ?? selectedMatch.item.name}</strong>
            <p>{selectedMatch.item.featureRecipe?.profile ?? selectedMatch.item.assemblyRole}</p>
            <ul>
              {(selectedMatch.item.featureRecipe?.history ?? selectedMatch.item.criteria.map((criterion, index) => ({ id: `${selectedMatch.item.id}-${index}`, label: criterion, value: selectedMatch.item.manufacturing.process, kind: 'placement' as const }))).map((step) => (
                <li className={`kind-${step.kind}`} key={step.id}><span>{step.label}</span><small>{step.value}</small></li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="guided-action-row">
        <button onClick={onApplyToSelected} type="button">Apply guided recipe to {selectedPartName}</button>
        <button className="primary-guided-action" onClick={onPlaceInAssembly} type="button">Place matched part in assembly</button>
        <button onClick={onSyncCatalog} type="button">Open match details below</button>
      </div>
    </section>
  );
}

function CanvasToolPalette({
  onCreatePart,
  onCreateAssembly,
  selectedPartName,
}: {
  onCreatePart: (kind: CADPrimitiveShape) => void;
  onCreateAssembly: () => void;
  selectedPartName: string;
}) {
  const jumpTo = (selector: string) => {
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const creationTools: Array<[CADPrimitiveShape, string, string]> = [
    ['base_plate', 'Base shape', 'flat base plate'],
    ['beam', 'Beam', 'arm link or rail'],
    ['cylinder_joint', 'Joint', 'revolute or bearing proxy'],
    ['bracket', 'Bracket', 'mounting support'],
    ['motor_block', 'Motor', 'actuator block proxy'],
    ['connector', 'Connector', 'harness connector'],
    ['electronics', 'Electronics', 'PCB or module block'],
    ['tool', 'Tool plate', 'end-effector mount'],
  ];
  return (
    <section className="canvas-tool-palette" aria-label="Canvas CAD tool palette">
      <div>
        <p className="eyebrow">CAD tools</p>
        <strong>Pick a tool, place a proxy primitive, then label and dimension it.</strong>
        <small>MVP authoring primitives only, not imported manufacturing CAD.</small>
      </div>
      <div className="canvas-tool-grid">
        {creationTools.map(([kind, label, title]) => (
          <button key={kind} onClick={() => onCreatePart(kind)} title={`Add ${title}`} type="button">
            <span className={`primitive-icon primitive-${kind}`} aria-hidden="true" />
            {label}
          </button>
        ))}
        <button onClick={onCreateAssembly} type="button">New assembly</button>
        <button onClick={() => jumpTo('#selected-geometry-editor')} type="button">Label {selectedPartName}</button>
        <button onClick={() => jumpTo('#viewport-selected-editor')} type="button">Dimensions</button>
        <button onClick={() => jumpTo('#viewport-selected-editor')} type="button">Move/nudge</button>
        <button onClick={() => jumpTo('#viewport-selected-editor')} type="button">Rotate</button>
        <button onClick={() => jumpTo('#units-targets-editor')} type="button">Units</button>
        <button onClick={() => jumpTo('#assembly-authoring-editor')} type="button">Joint link</button>
        <button onClick={() => jumpTo('#assembly-authoring-editor')} type="button">Wire route</button>
      </div>
    </section>
  );
}

function CatalogMatchPanel({
  matches,
  onAddToAssembly,
  onApplyToSelected,
  onQueryChange,
  onSelectMatch,
  query,
  selectedMatch,
  selectedPartName,
  units,
}: {
  matches: LocalPartCatalogMatch[];
  onAddToAssembly: () => void;
  onApplyToSelected: () => void;
  onQueryChange: (query: string) => void;
  onSelectMatch: (catalogItemId: string) => void;
  query: string;
  selectedMatch?: LocalPartCatalogMatch;
  selectedPartName: string;
  units: AuthoringUnit;
}) {
  const examples = ['joint motor', 'servo actuator', 'round arm connector', 'arm link', 'gripper bracket', 'base plate'];
  return (
    <section className="panel authoring-panel catalog-match-panel" id="catalog-match-editor" aria-label="Catalog matching for unknown part names">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Catalog match</p>
          <h2>Describe unknown parts, then use the match in the assembly</h2>
        </div>
        <span className="status-pill status-review_required">deterministic local</span>
      </div>
      <p className="microcopy">
        If the exact part name is unknown, type plain language such as joint motor, servo actuator, arm link, gripper bracket, or base plate.
        MechaFlow matches against a small local robot-arm catalog, explains why, and keeps the result editable.
      </p>
      <label className="field-row compact-field" htmlFor="part-catalog-query">
        <span>Plain-language part label or description</span>
        <input
          id="part-catalog-query"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="joint motor, servo actuator, arm link, gripper bracket, base plate"
          type="text"
          value={query}
        />
      </label>
      <div className="catalog-query-examples" aria-label="Catalog match examples">
        {examples.map((example) => (
          <button key={example} onClick={() => onQueryChange(example)} type="button">{example}</button>
        ))}
      </div>
      <div className="catalog-match-grid" aria-label="Local catalog match suggestions">
        {matches.map((match) => {
          const selected = selectedMatch?.item.id === match.item.id;
          return (
            <button
              aria-pressed={selected}
              className={`catalog-match-card confidence-${match.confidence} ${selected ? 'selected' : ''}`}
              key={match.item.id}
              onClick={() => onSelectMatch(match.item.id)}
              type="button"
            >
              <span>{match.score}% {match.confidence} confidence</span>
              <strong>{match.item.name}</strong>
              <small>{match.item.partType} - {match.item.primitive.replaceAll('_', ' ')} - {match.item.manufacturing.process.replaceAll('_', ' ')}</small>
              <p>{match.reasoning}</p>
            </button>
          );
        })}
      </div>
      {selectedMatch ? (
        <div className={`catalog-match-detail confidence-${selectedMatch.confidence}`} aria-live="polite">
          <div>
            <strong>{selectedMatch.item.name}</strong>
            <span>{selectedMatch.item.source.label} - {selectedMatch.item.source.license}</span>
            <p>{selectedMatch.item.assemblyRole}</p>
          </div>
          <dl className="comparison-grid">
            <div>
              <dt>Type inferred</dt>
              <dd>{selectedMatch.item.partType}</dd>
            </div>
            <div>
              <dt>Dimensions</dt>
              <dd>
                L {selectedMatch.item.defaultDimensionsMm.lengthMm == null ? 'review' : formatLength(selectedMatch.item.defaultDimensionsMm.lengthMm, units)} / W {selectedMatch.item.defaultDimensionsMm.widthMm == null ? 'review' : formatLength(selectedMatch.item.defaultDimensionsMm.widthMm, units)} / H {selectedMatch.item.defaultDimensionsMm.heightMm == null ? 'review' : formatLength(selectedMatch.item.defaultDimensionsMm.heightMm, units)}
              </dd>
            </div>
            <div>
              <dt>Material</dt>
              <dd>{selectedMatch.item.materialSummary}</dd>
            </div>
            <div>
              <dt>Process</dt>
              <dd>{selectedMatch.item.manufacturing.process.replaceAll('_', ' ')} - {formatLeadTimeRange({ min: selectedMatch.item.manufacturing.leadTimeDaysMin, max: selectedMatch.item.manufacturing.leadTimeDaysMax })}</dd>
            </div>
          </dl>
          <ul>
            {selectedMatch.item.criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}
          </ul>
          <div className="catalog-match-actions">
            <button onClick={onApplyToSelected} type="button">Apply to selected part</button>
            <button className="primary-match-action" onClick={onAddToAssembly} type="button">Add matched part to assembly</button>
          </div>
          <small className="runner-note">
            {selectedMatch.confidence === 'low'
              ? 'Low confidence: apply only as an editable starter and confirm the type, dimensions, material, process, and supplier data.'
              : 'The match supplies local catalog metadata, then the selected geometry, dimensions, material, and process remain editable.'}
          </small>
          <small className="runner-note">Current selection: {selectedPartName}. Newly added matched parts are selected immediately and can be wired into the assembly.</small>
        </div>
      ) : null}
    </section>
  );
}

function SelectedPartCanvasCard({
  activeTask,
  assemblyParts,
  loadSizingFinding,
  part,
  selectedOption,
  units,
}: {
  activeTask: ReferenceDesign['task'];
  assemblyParts: Part[];
  loadSizingFinding?: RobotArmLoadSizingFinding;
  part: Part;
  selectedOption?: MaterialOption;
  units: AuthoringUnit;
}) {
  const materialCriterion = part.designCriteria.find((criterion) => criterion.id === 'elasticity-stiffness');
  const processCriterion = part.designCriteria.find((criterion) => criterion.id === 'manufacturing-process');
  const loadCriterion = part.designCriteria.find((criterion) => criterion.id === 'load-capacity');
  const thermalCriterion = part.designCriteria.find((criterion) => criterion.id === 'temperature-limit');
  const materialStrengthCriterion = part.designCriteria.find((criterion) => criterion.id === 'material-strength');
  const catalogMatchCriterion = part.designCriteria.find((criterion) => criterion.id === 'catalog-match');
  const featureRecipeCriterion = part.designCriteria.find((criterion) => criterion.id === 'feature-recipe');
  const viewportSketchCriterion = part.designCriteria.find((criterion) => criterion.id === 'viewport-sketch-operation');
  const holeFastenerCriterion = part.designCriteria.find((criterion) => criterion.id === 'hole-fastener-placement');
  const sizingUpgradeCriterion = part.designCriteria.find((criterion) => criterion.id === 'requirement-sizing-upgrade');
  const parentPart = part.authoring.parentPartId ? assemblyParts.find((candidate) => candidate.id === part.authoring.parentPartId) : null;
  const warnings = reviewWarningsForPart(part, selectedOption);
  const thermalLimit = part.analysisReadiness.thermal_guidance?.heat_deflection_temp_c
    ?? part.analysisReadiness.thermal_guidance?.max_service_temp_c
    ?? null;
  return (
    <section className="selected-part-canvas-card" aria-label="Selected part detail card">
      <div className="selected-part-hero">
        <p className="eyebrow">Selected actual part</p>
        <h3>Selected: {part.name}</h3>
        <p>{part.purpose}</p>
        <small>Primitive proxy: {primitiveLabel(part.authoring.primitive)} in {part.subassembly}. This is authored visual geometry and project metadata, not a full parametric CAD kernel.</small>
        {part.authoring.featureRecipe ? <small>Sketch recipe: {part.authoring.featureRecipe.name}. {part.authoring.featureRecipe.plane} includes {part.authoring.featureRecipe.callouts.map((callout) => `${callout.label} ${formatFeatureRecipeCallout(part, callout, units)}`).join(', ')}.</small> : null}
        {viewportSketchCriterion ? <small>{viewportSketchCriterion.label}: {viewportSketchCriterion.value}. {viewportSketchCriterion.plainEnglish}</small> : null}
        {holeFastenerCriterion ? <small>{holeFastenerCriterion.label}: {holeFastenerCriterion.value}. {holeFastenerCriterion.plainEnglish}</small> : null}
        {catalogMatchCriterion ? <small>Local catalog match: {catalogMatchCriterion.value}. {catalogMatchCriterion.plainEnglish}</small> : null}
        {loadSizingFinding ? <small>Requirement sizing: {loadSizingFinding.status} - requires {formatMeasurement(loadSizingFinding.requiredValue)} {loadSizingFinding.unit}, rated {loadSizingFinding.ratedValue == null ? 'review required' : `${formatMeasurement(loadSizingFinding.ratedValue)} ${loadSizingFinding.unit}`}. {loadSizingFinding.reason}</small> : null}
        {sizingUpgradeCriterion ? <small>{sizingUpgradeCriterion.label}: {sizingUpgradeCriterion.value}. {sizingUpgradeCriterion.plainEnglish}</small> : null}
      </div>
      <dl className="selected-part-stat-grid">
        <div>
          <dt>Dimensions</dt>
          <dd>{dimensionSummary(part, units)}</dd>
        </div>
        <div>
          <dt>Material</dt>
          <dd>{part.material}<small>{materialCriterion?.sourceConfidence ?? 'review-required source'}</small></dd>
        </div>
        <div>
          <dt>Process</dt>
          <dd>{part.manufacturingProcess}<small>{processCriterion?.sourceConfidence ?? 'process review required'}</small></dd>
        </div>
        <div>
          <dt>Weight</dt>
          <dd>{part.weightLb == null ? 'Review required mass' : `${part.weightLb.toFixed(2)} lb demo estimate`}</dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd>{part.costRangeUsd == null ? 'Review required cost' : `${formatUsdRange(part.costRangeUsd)} seed range`}</dd>
        </div>
        <div>
          <dt>Stress or capability</dt>
          <dd>{riskLabel[part.stressRisk]} stress risk<small>{part.rating.payloadLb == null ? 'payload and safety factor review required' : part.rating.summary}</small></dd>
        </div>
        <div>
          <dt>XYZ location</dt>
          <dd>
            X {formatLength(part.authoring.positionMm.x, units)} / Y {formatLength(part.authoring.positionMm.y, units)} / Z {formatLength(part.authoring.positionMm.z, units)}
            <small>Position in the active assembly grid</small>
          </dd>
        </div>
        <div>
          <dt>Assembly link</dt>
          <dd>{parentPart ? `${parentPart.name} via ${part.authoring.jointType.replaceAll('_', ' ')}` : 'Top-level or unassigned'}<small>{part.authoring.assignedToPartId ? `Assigned to ${part.authoring.assignedToPartId}` : 'Editable parent and joint metadata'}</small></dd>
        </div>
      </dl>
      <div className="selected-part-rationale-grid">
        <article>
          <strong>Why this material or process is here</strong>
          <p>{materialCriterion?.plainEnglish ?? 'Material rationale needs review.'}</p>
          <p>{processCriterion?.plainEnglish ?? 'Manufacturing rationale needs process review.'}</p>
          <small>Source confidence: {materialCriterion?.sourceConfidence ?? 'review required'}.</small>
        </article>
        <article>
          <strong>Task criteria and thresholds</strong>
          <ul>
            <li>Payload: {activeTask.targetPayloadLb == null ? 'review required' : `${activeTask.targetPayloadLb} lb preserved task`}.</li>
            <li>Reach: {activeTask.reachMeters == null ? 'review required' : `${activeTask.reachMeters} m target`}.</li>
            <li>Safety factor: {activeTask.safetyFactorMin == null ? 'review required' : `${activeTask.safetyFactorMin} minimum guidance`}.</li>
            <li>Stiffness or yield: {materialCriterion?.value ?? 'stiffness review required'}; {materialStrengthCriterion?.value ?? 'yield review required'}.</li>
            <li>Heat: {thermalLimit == null ? thermalCriterion?.value ?? 'temperature review required' : `${formatMeasurement(thermalLimit)} C screening limit`}.</li>
          </ul>
        </article>
        {featureRecipeCriterion || viewportSketchCriterion || holeFastenerCriterion ? (
          <article>
            <strong>Sketch, hole, and feature history</strong>
            {featureRecipeCriterion ? <p>{featureRecipeCriterion.plainEnglish}</p> : null}
            {viewportSketchCriterion ? <p>{viewportSketchCriterion.plainEnglish}</p> : null}
            {holeFastenerCriterion ? <p>{holeFastenerCriterion.plainEnglish}</p> : null}
            <small>{featureRecipeCriterion?.sourceConfidence ?? viewportSketchCriterion?.sourceConfidence ?? holeFastenerCriterion?.sourceConfidence}</small>
          </article>
        ) : null}
        {loadSizingFinding ? (
          <article className={`selected-load-card status-${loadSizingFinding.status}`}>
            <strong>Requirement sizing check</strong>
            <p>{loadSizingFinding.componentRole}: {loadSizingFinding.status.replaceAll('_', ' ')}.</p>
            <p>{loadSizingFinding.evidence}</p>
            {loadSizingFinding.fix ? <small>Catalog-backed fix: {loadSizingFinding.fix.label}. {loadSizingFinding.fix.summary}</small> : <small>No automatic local fix is applied. Route to engineering review.</small>}
          </article>
        ) : null}
        <article>
          <strong>Load cases, constraints, and serviceability</strong>
          <ul>
            <li>{part.analysisReadiness.load_cases[0]?.name ?? loadCriterion?.label ?? 'Load case review required'}: {part.analysisReadiness.load_cases[0]?.magnitude == null ? loadCriterion?.value ?? 'review required' : `${formatMeasurement(part.analysisReadiness.load_cases[0].magnitude)} ${part.analysisReadiness.load_cases[0].unit ?? ''}`}.</li>
            <li>{part.analysisReadiness.constraints[0]?.name ?? 'Constraints review required'}: {part.analysisReadiness.constraints[0]?.region ?? 'fixture, joint, and contact regions need CAD naming'}.</li>
            <li>Manufacturing: {processCriterion?.plainEnglish ?? 'process and tolerance review required'}.</li>
            <li>Wiring or serviceability: {part.relatedWires.length ? `${part.relatedWires.length} linked route(s) need clearance and service-loop review` : activeTask.serviceGoal}.</li>
          </ul>
        </article>
        <article className="selected-review-card">
          <strong>Review-required warnings</strong>
          {warnings.length > 0 ? <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p>No additional warnings in the seed card, but engineering review is still required before release.</p>}
        </article>
      </div>
    </section>
  );
}

function EmptyPanelNotice({ title, children }: { title: string; children: string }) {
  return (
    <div className="inline-empty-state" role="status">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function DemoGuidePanel({
  steps,
  onOpenStep,
  onMarkReviewed,
}: {
  steps: DemoGuideStep[];
  onOpenStep: (step: DemoGuideStep) => void;
  onMarkReviewed: (stepId: string) => void;
}) {
  const completed = steps.filter((step) => step.status === 'complete').length;
  const progress = Math.round((completed / steps.length) * 100);

  return (
    <section className="panel demo-guide-panel" aria-label="MVP coverage guide">
      <div className="demo-guide-heading">
        <div>
          <p className="eyebrow">MVP coverage guide</p>
          <h2>Progressive tool coverage</h2>
          <p>
            Use this after the project is open to verify analysis, evidence, manufacturing, wiring, and export coverage.
            It stays out of the opening workflow so new users can start from the model and command line.
          </p>
        </div>
        <div className="demo-progress" aria-label={`${completed} of ${steps.length} demo steps complete`}>
          <strong>{completed}/{steps.length}</strong>
          <span>steps complete</span>
          <div className="progress-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
        </div>
      </div>
      <ol className="demo-step-list">
        {steps.map((step, index) => (
          <li className={`demo-step status-${step.status}`} key={step.id}>
            <div className="demo-step-index" aria-hidden="true">{index + 1}</div>
            <div>
              <strong>{step.label}</strong>
              <span>{demoGuideStatusLabel[step.status]}</span>
              <p>{step.summary}</p>
              <div className="demo-step-actions">
                <a href={step.anchor} onClick={(event) => { event.preventDefault(); onOpenStep(step); }}>{step.actionLabel}</a>
                {step.canMarkReviewed && step.status !== 'complete' ? (
                  <button type="button" onClick={() => onMarkReviewed(step.id)}>Mark reviewed</button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AssemblySelector({
  assemblies,
  selectedAssemblyId,
  onSelect,
}: {
  assemblies: Assembly[];
  selectedAssemblyId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <label className="assembly-selector">
      <span>Assembly</span>
      <select aria-label="Assembly" value={selectedAssemblyId} onChange={(event) => onSelect(event.target.value)}>
        {assemblies.map((assembly) => (
          <option key={assembly.id} value={assembly.id}>{assembly.name}</option>
        ))}
      </select>
    </label>
  );
}

function ProjectFilePanel({
  canUseProjectFiles,
  message,
  onExport,
  onImport,
  pending,
  projectId,
}: {
  canUseProjectFiles: boolean;
  message: string | null;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  pending: boolean;
  projectId: string;
}) {
  return (
    <section className="project-file-panel" id="project-file-controls" aria-label="Project file import and export">
      <div>
        <strong>Portable project file</strong>
        <small>JSON v1 preserves project {projectId}, units, visual primitives, assemblies, wiring, materials, analysis readiness, and artifacts.</small>
      </div>
      <div className="project-file-actions">
        <button disabled={!canUseProjectFiles || pending} onClick={onExport} type="button">
          Export project
        </button>
        <label className={`file-import-button ${!canUseProjectFiles || pending ? 'disabled' : ''}`}>
          <span>Import project</span>
          <input
            accept=".mfcad.json,application/json"
            aria-label="Import MechaFlow project file"
            disabled={!canUseProjectFiles || pending}
            onChange={onImport}
            type="file"
          />
        </label>
      </div>
      <small className="project-file-help">
        {canUseProjectFiles
          ? 'Use this to save, share, and reopen the current browser-authored visual model. A backend connection is optional.'
          : 'Project import or export is temporarily unavailable while the file operation is pending.'}
      </small>
      {message ? <p className="project-file-message" aria-live="polite">{message}</p> : null}
    </section>
  );
}

function PartTree({ parts, selectedPartId, onSelect }: { parts: Part[]; selectedPartId: string; onSelect: (id: string) => void }) {
  return (
    <div className="part-tree">
      <h3>Selectable parts</h3>
      {parts.map((part) => (
        <button
          className={part.id === selectedPartId ? 'active' : ''}
          key={part.id}
          onClick={() => onSelect(part.id)}
          type="button"
        >
          <span>{part.name}</span>
          <small>{part.subassembly}</small>
        </button>
      ))}
    </div>
  );
}

function CapabilityCard({
  rating,
  safetyFactorMin,
  targetPayloadLb,
}: {
  rating: { status: 'passes' | 'watch' | 'fails'; payloadLb: number | null; safetyFactor: number | null; summary: string; warning?: string };
  safetyFactorMin: number | null;
  targetPayloadLb: number | null;
}) {
  const hasRating = rating.payloadLb != null && rating.safetyFactor != null && targetPayloadLb != null;
  const delta = hasRating ? rating.payloadLb! - targetPayloadLb! : null;
  const payloadThreshold = rating.status === 'fails'
    ? targetPayloadLb
    : rating.status === 'watch' && targetPayloadLb != null && safetyFactorMin != null
      ? targetPayloadLb * safetyFactorMin
      : null;
  const payloadDisplay = rating.payloadLb == null
    ? null
    : payloadThreshold == null
      ? formatMeasurement(rating.payloadLb)
      : formatThresholdMeasurement(rating.payloadLb, payloadThreshold);
  const safetyFactorThreshold = rating.status === 'fails'
    ? 1
    : rating.status === 'watch' ? safetyFactorMin : null;
  const safetyFactorDisplay = rating.safetyFactor == null
    ? undefined
    : safetyFactorThreshold == null
      ? formatMeasurement(rating.safetyFactor)
      : formatThresholdMeasurement(rating.safetyFactor, safetyFactorThreshold);
  const deltaDisplay = delta == null
    ? null
    : payloadThreshold == null || targetPayloadLb == null
      ? `${delta >= 0 ? '+' : ''}${formatMeasurement(delta)}`
      : formatSignedThresholdMeasurement(delta, payloadThreshold - targetPayloadLb);
  return (
    <div className={`capability-card status-${rating.status}`}>
      <span>{statusLabel[rating.status]}</span>
      <strong>{hasRating ? `${payloadDisplay} lb projected rating` : 'Payload rating review required'}</strong>
      {hasRating && delta != null ? (
        <small>
          Safety factor {safetyFactorDisplay} - {deltaDisplay} lb against preserved task
        </small>
      ) : <small>Safety factor and payload delta are unknown.</small>}
      <p>{rating.summary}</p>
      {rating.warning ? <p className="warning">{rating.warning}</p> : null}
    </div>
  );
}

function StrengthInfoPanel({ part }: { part: Part }) {
  return (
    <section className="strength-panel" aria-label="Design criteria and strength information">
      <h3>Design criteria and strength notes</h3>
      <p className="muted">
        These values are demo seed data or material properties unless marked measured. They are not real FEA results.
      </p>
      <div className="criteria-list">
        {part.designCriteria.map((criterion) => (
          <article className={`criterion-card status-${criterion.status}`} key={criterion.id}>
            <div>
              <strong>{criterion.label}</strong>
              <span>{criterion.status.replace('-', ' ')}</span>
            </div>
            <p>{criterion.value}</p>
            <small>{criterion.plainEnglish}</small>
            <small className="criterion-source">Source and confidence: {criterion.sourceConfidence}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function PreSolverReadinessPanel({ readiness, title }: { readiness: Part['analysisReadiness']; title: string }) {
  const material = readiness.material_properties;
  const thermal = readiness.thermal_guidance;
  const stateLabel = readiness.state === 'pre_solver_ready'
    ? 'Pre-solver ready'
    : readiness.state === 'solver_result_available'
      ? 'Real solver result available'
      : 'Review required before solve';
  const trustLabel = readiness.trust_label === 'solver_result'
    ? 'real solver result'
    : readiness.trust_label === 'demo_estimate'
      ? 'demo estimate only'
      : 'pre-solver input only';
  const thermalLimit = thermal?.heat_deflection_temp_c ?? thermal?.max_service_temp_c ?? null;

  return (
    <section className="readiness-panel" aria-label={`${title} pre-solver analysis readiness`}>
      <p className="eyebrow">{title}</p>
      <div className={`readiness-banner state-${readiness.state}`}>
        <span>{stateLabel}</span>
        <strong>{trustLabel} - no FEA claim unless a solver result is present</strong>
      </div>
      <p>{readiness.summary}</p>
      <dl className="readiness-summary">
        <div>
          <dt>Stiffness input</dt>
          <dd>
            {material?.properties.elastic_modulus_gpa == null
              ? 'Review required'
              : `${formatMeasurement(material.properties.elastic_modulus_gpa)} GPa elastic modulus`}
          </dd>
        </div>
        <div>
          <dt>Yield input</dt>
          <dd>
            {material?.properties.yield_strength_mpa == null
              ? 'Review required'
              : `${formatMeasurement(material.properties.yield_strength_mpa)} MPa yield strength`}
          </dd>
        </div>
        <div>
          <dt>Heat limit</dt>
          <dd>{thermalLimit == null ? 'Review required' : `${formatMeasurement(thermalLimit)} C screening limit`}</dd>
        </div>
        <div>
          <dt>Material provenance</dt>
          <dd>{material?.provenance.replaceAll('_', ' ') ?? 'review required'}</dd>
        </div>
      </dl>
      <div className="readiness-stack">
        <div>
          <h4>Explicit load cases</h4>
          {readiness.load_cases.length > 0 ? readiness.load_cases.map((load) => (
            <p key={load.id}>
              <strong>{load.name}</strong>: {load.magnitude == null ? 'magnitude review required' : `${formatMeasurement(load.magnitude)} ${load.unit ?? ''}`} on {load.application_region}.
            </p>
          )) : <p>Load case review required before a worker can solve this part.</p>}
        </div>
        <div>
          <h4>Constraints</h4>
          {readiness.constraints.map((constraint) => (
            <p key={constraint.id}>
              <strong>{constraint.name}</strong>: {constraint.constraint_type.replaceAll('_', ' ')} at {constraint.region}.
            </p>
          ))}
        </div>
        <div>
          <h4>Solver handoff artifacts</h4>
          <ul>
            {readiness.expected_result_artifacts.slice(0, 4).map((artifact) => (
              <li key={artifact.kind}>{artifact.title} from {artifact.produced_by} ({artifact.file_format})</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Review required</h4>
          <ul>
            {readiness.review_required.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
      {readiness.demo_estimates.length > 0 ? (
        <div className="demo-estimate-note">
          <strong>Demo estimates, not FEA</strong>
          <ul>{readiness.demo_estimates.map((estimate) => <li key={estimate}>{estimate}</li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}

function MaterialSubstitution({
  canUseBackend,
  message,
  onApply,
  onPreview,
  options,
  pending,
  previewActive,
  selectedOption,
  onSelect,
}: {
  canUseBackend: boolean;
  message: string | null;
  onApply: () => void;
  onPreview: () => void;
  options: MaterialOption[];
  pending: boolean;
  previewActive: boolean;
  selectedOption?: MaterialOption;
  onSelect: (id: string) => void;
}) {
  if (options.length === 0) {
    return <p className="muted">No compatible substitution options are available; material and process compatibility review is required.</p>;
  }

  const blocked = Boolean(selectedOption?.blockedReasons.length);

  return (
    <div className="substitution-panel">
      <h3>Task-preserving material substitution</h3>
      <label htmlFor="material-option">Preview option: compatible material and process</label>
      <select id="material-option" value={selectedOption?.id} onChange={(event) => onSelect(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.material} via {option.process} - {option.reviewRequired ? 'review required' : statusLabel[option.status]}
          </option>
        ))}
      </select>
      {selectedOption ? (
        <div className="option-impact">
          <p>{selectedOption.taskImpact}</p>
          <dl className="comparison-grid">
            <div>
              <dt>Current</dt>
              <dd>{selectedOption.currentMaterial ?? 'Review required'} via {selectedOption.currentProcess ?? 'review-required process'}</dd>
            </div>
            <div>
              <dt>Substitute</dt>
              <dd>{selectedOption.material} via {selectedOption.process}</dd>
            </div>
            <div>
              <dt>Weight effect</dt>
              <dd>{selectedOption.weightDeltaLb == null
                ? 'review required'
                : `${selectedOption.weightDeltaLb > 0 ? '+' : ''}${selectedOption.weightDeltaLb.toFixed(2)} lb estimated from density`}</dd>
            </div>
            <div>
              <dt>Stiffness</dt>
              <dd>{selectedOption.stiffnessGpa == null ? 'review required' : `${formatMeasurement(selectedOption.stiffnessGpa)} GPa modulus`}</dd>
            </div>
            <div>
              <dt>Yield strength</dt>
              <dd>{selectedOption.yieldStrengthMpa == null ? 'review required' : `${formatMeasurement(selectedOption.yieldStrengthMpa)} MPa material yield`}</dd>
            </div>
            <div>
              <dt>Heat limit</dt>
              <dd>{selectedOption.heatLimitC == null ? 'review required' : `${formatMeasurement(selectedOption.heatLimitC)} C screening limit`}</dd>
            </div>
            <div>
              <dt>Cost range</dt>
              <dd>{selectedOption.costRangeUsd == null ? 'review required' : `${formatUsdRange(selectedOption.costRangeUsd)} heuristic range`}</dd>
            </div>
            <div>
              <dt>Lead time</dt>
              <dd>{formatLeadTimeRange(selectedOption.leadTimeRangeDays)}</dd>
            </div>
          </dl>
          <ul>
            <li>{selectedOption.manufacturingImpact}</li>
            <li>{selectedOption.wiringImpact}</li>
            <li>Confidence: material {selectedOption.materialConfidence.replaceAll('_', ' ')}, process {selectedOption.manufacturingConfidence.replaceAll('_', ' ')}.</li>
          </ul>
          {selectedOption.warnings.length > 0 ? (
            <details>
              <summary>Review-required warnings</summary>
              <ul>{selectedOption.warnings.slice(0, 4).map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </details>
          ) : null}
          {blocked ? <p className="warning">Blocked: {selectedOption.blockedReasons.join(' ')}</p> : null}
          <div className="substitution-actions">
            <button disabled={!canUseBackend || pending || blocked} onClick={onPreview} type="button">
              {pending ? 'Working...' : 'Preview backend impact'}
            </button>
            <button disabled={!canUseBackend || pending || blocked || !previewActive} onClick={onApply} type="button">
              Apply validated substitution
            </button>
          </div>
          <small className="runner-note">
            Preview is non-persisted. Apply mutates the backend project only after the same compatibility validation passes.
          </small>
          {!canUseBackend ? <small className="runner-note">Offline bundled mock data is read-only; connect the backend to apply.</small> : null}
          {message ? <p className="runner-message" aria-live="polite">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function ModificationPreview({ selectedOption }: { selectedOption?: MaterialOption }) {
  if (!selectedOption) {
    return null;
  }

  return (
    <div className="modification-preview" aria-label="Backend modification preview">
      <h3>Local modification preview</h3>
      <small>
        {selectedOption.backendModification.method} {selectedOption.backendModification.endpoint}
      </small>
      <p>{selectedOption.backendModification.reportSummary}</p>
      <code>{JSON.stringify(selectedOption.backendModification.payload, null, 2)}</code>
    </div>
  );
}

function AnalysisPanel({
  design,
  onRunPreSolver,
  onRunSolverReadiness,
  runMessage,
  runPending,
  selectedPart,
  solverReadiness,
}: {
  design: ReferenceDesign;
  onRunPreSolver: () => void;
  onRunSolverReadiness: () => void;
  runMessage: string | null;
  runPending: boolean;
  selectedPart: Part;
  solverReadiness: LocalSolverReadinessSummary | null;
}) {
  const canRun = Boolean(design.backend.apiBaseUrl) && !runPending;
  const fixtureMode = solverReadiness?.execution_modes.find((mode) => mode.id === 'calculix_fixture');
  const jobCounts = design.analysisJobs.reduce<Record<string, number>>((counts, job) => {
    counts[job.status] = (counts[job.status] ?? 0) + 1;
    return counts;
  }, {});
  const resolveArtifactUrl = (downloadUrl: string): string => {
    if (/^https?:\/\//.test(downloadUrl)) return downloadUrl;
    return `${design.backend.apiBaseUrl ?? ''}${downloadUrl}`;
  };
  return (
    <article className="panel job-queue-panel" id="analysis-queue">
      <p className="eyebrow">Analysis job queue</p>
      <h2>Local-first orchestration and cached reports</h2>
      <p>
        The queue explains every pending, running, completed, failed, solver-unavailable, and review-required job.
        Cloud guidance is planning-only until a provider, credentials, budget guardrails, and explicit approval exist.
      </p>
      <div className="queue-metrics" aria-label="Analysis job queue status counts">
        <div><strong>{design.analysisJobs.length}</strong><span>jobs tracked</span></div>
        <div><strong>{jobCounts.running ?? 0}</strong><span>running</span></div>
        <div><strong>{jobCounts.complete ?? 0}</strong><span>completed</span></div>
        <div><strong>{(jobCounts['review-required'] ?? 0) + (jobCounts['solver-unavailable'] ?? 0) + (jobCounts.blocked ?? 0)}</strong><span>need action</span></div>
      </div>
      <div className="solver-state-grid" aria-label="Local solver readiness states">
        <div>
          <strong>Selected target</strong>
          <span className={`readiness-pill state-${selectedPart.analysisReadiness.state}`}>
            {selectedPart.analysisReadiness.state.replaceAll('_', ' ')}
          </span>
          <small>{selectedPart.analysisReadiness.trust_label.replaceAll('_', ' ')} - selected part readiness</small>
        </div>
        <div>
          <strong>Solver fixture</strong>
          <span className={`readiness-pill state-${fixtureMode?.status ?? 'review_required'}`}>
            {(fixtureMode?.status ?? 'review_required').replaceAll('_', ' ')}
          </span>
          <small>{fixtureMode?.summary ?? 'Connect the FastAPI backend to inspect local solver tools.'}</small>
        </div>
      </div>
      {solverReadiness ? (
        <>
          <p className="runner-note">{solverReadiness.summary}</p>
          <div className="solver-tools" aria-label="Detected local solver tools">
            {solverReadiness.tool_statuses.map((tool) => (
              <div className={`tool-card ${tool.availability}`} key={tool.open_source_tool}>
                <strong>{tool.open_source_tool}</strong>
                <span>{tool.availability === 'available' ? 'available' : 'solver unavailable'}</span>
                <small>{tool.resolved_command ?? tool.binary_candidates.join(', ')}</small>
                <p>{tool.message}</p>
                {tool.availability === 'unavailable' && tool.install_guidance ? <small>{tool.install_guidance}</small> : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="runner-note">Solver tool detection is unavailable until the cockpit is connected to FastAPI.</p>
      )}
      <div className="runner-actions">
        <button className="runner-button" disabled={!canRun} onClick={onRunPreSolver} type="button">
          {runPending ? 'Running analysis job...' : `Run pre-solver screening for ${selectedPart.name}`}
        </button>
        <button className="runner-button secondary" disabled={!canRun} onClick={onRunSolverReadiness} type="button">
          {runPending ? 'Running analysis job...' : `Run solver-readiness fixture for ${selectedPart.name}`}
        </button>
      </div>
      {!design.backend.apiBaseUrl ? (
        <small className="runner-note">Connect the React desktop demo to the local FastAPI backend to persist runner jobs.</small>
      ) : null}
      {runMessage ? <p className="runner-message" aria-live="polite">{runMessage}</p> : null}
      <div className="job-list" aria-label="Analysis jobs with recommendations and cached artifacts">
        {design.analysisJobs.length === 0 ? (
          <EmptyPanelNotice title="No analysis jobs yet">Run a local-safe pre-solver screening, import a project with retained jobs, or review the backend queue once it is connected.</EmptyPanelNotice>
        ) : design.analysisJobs.map((job) => {
          const recommendation = job.recommendation;
          const targetLabel = recommendation?.recommended_target.replaceAll('_', ' ') ?? 'recommendation unavailable';
          return (
            <div className="job-row" key={job.id}>
              <div className="job-row-heading">
                <div>
                  <strong>{job.name}</strong>
                  <small>{job.worker} for {job.targetId}</small>
                </div>
                <span className={`job-status ${job.status}`}>{job.status.replaceAll('-', ' ')}</span>
              </div>
              <div
                className="progress-track"
                aria-label={`${job.name} ${job.progress == null ? 'progress unknown' : `${job.progress}%`}`}
              >
                <span style={{ width: `${job.progress ?? 0}%` }} />
              </div>
              <p>{job.summary}</p>
              {recommendation ? (
                <section className={`recommendation-card target-${recommendation.recommended_target}`}>
                  <div>
                    <span>Recommended target</span>
                    <strong>{targetLabel}</strong>
                    <small>{recommendation.status.replaceAll('_', ' ')}</small>
                  </div>
                  <p>{recommendation.summary}</p>
                  <dl className="estimate-grid">
                    <div>
                      <dt>Runtime estimate</dt>
                      <dd>{formatAnalysisEstimate(recommendation.expected_runtime_minutes)}</dd>
                    </div>
                    <div>
                      <dt>Cost estimate</dt>
                      <dd>{formatAnalysisEstimate(recommendation.cost_estimate)}</dd>
                    </div>
                    <div>
                      <dt>Wait estimate</dt>
                      <dd>{formatAnalysisEstimate(recommendation.wait_time_estimate)}</dd>
                    </div>
                  </dl>
                  <small className="runner-note">{recommendation.cost_estimate.notice}</small>
                  {recommendation.missing_local_tools.length > 0 ? (
                    <small className="runner-note">Missing local tools: {recommendation.missing_local_tools.join(', ')}</small>
                  ) : null}
                  <details>
                    <summary>Why this recommendation?</summary>
                    <ul>
                      {recommendation.reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}
                      {recommendation.review_required.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </details>
                </section>
              ) : null}
              {job.trustLabel || job.reviewStatus ? (
                <small className="runner-note">
                  {job.trustLabel?.replaceAll('_', ' ') ?? 'analysis job'} - {job.reviewStatus?.replaceAll('_', ' ') ?? 'status review required'}
                </small>
              ) : null}
              {job.cachedReportRefs.length > 0 ? (
                <div className="cache-strip" aria-label={`${job.name} cached reports`}>
                  <strong>Cached reports</strong>
                  {job.cachedReportRefs.map((report) => (
                    <small key={report.report_id}>{report.title} - {report.status.replaceAll('_', ' ')}{report.current ? '' : ' superseded'}</small>
                  ))}
                </div>
              ) : null}
              {job.cachedArtifactRefs.length > 0 || job.artifacts.length > 0 ? (
                <ul className="artifact-list" aria-label={`${job.name} artifacts`}>
                  {(job.cachedArtifactRefs.length > 0 ? job.cachedArtifactRefs : job.artifacts.map((artifact) => ({
                    artifact_id: artifact.id ?? `${job.id}-${artifact.kind}`,
                    kind: artifact.kind,
                    title: artifact.title,
                    status: 'metadata_only' as const,
                    generated_by: artifact.generatedBy ?? job.worker,
                    download_urls: [],
                    summary: artifact.summary,
                    stale_reason: undefined,
                  }))).map((artifactRef) => {
                    const artifact = job.artifacts.find((item) => item.id === artifactRef.artifact_id || item.kind === artifactRef.kind);
                    const manifestValue = artifact?.payload?.file_manifest;
                    const fileManifest = Array.isArray(manifestValue)
                      ? manifestValue as Array<Record<string, unknown>>
                      : [];
                    return (
                      <li key={`${job.id}-${artifactRef.artifact_id}-${artifactRef.title}`}>
                        {artifactRef.title} ({artifactRef.kind.replaceAll('_', ' ')})
                        <small>{artifactRef.status.replaceAll('_', ' ')} from {artifactRef.generated_by}</small>
                        {artifactRef.summary ? <small>{artifactRef.summary}</small> : null}
                        {artifactRef.stale_reason ? <small className="runner-note">{artifactRef.stale_reason}</small> : null}
                        {artifactRef.download_urls.length > 0 ? (
                          <div className="artifact-links">
                            {artifactRef.download_urls.map((url) => (
                              <a href={resolveArtifactUrl(url)} key={url}>Download cached artifact</a>
                            ))}
                          </div>
                        ) : null}
                        {fileManifest.length > 0 ? (
                          <details>
                            <summary>Generated files and logs</summary>
                            <ul>
                              {fileManifest.slice(0, 5).map((file) => {
                                const downloadUrl = typeof file.download_url === 'string' ? file.download_url : null;
                                return (
                                  <li key={`${String(file.name)}-${downloadUrl ?? String(file.path)}`}>
                                    <code>{String(file.name)}</code>{file.missing ? ' missing until solver runs' : ` ${String(file.bytes ?? '?')} bytes`}
                                    {downloadUrl && !file.missing ? <a href={resolveArtifactUrl(downloadUrl)}>open</a> : null}
                                  </li>
                                );
                              })}
                            </ul>
                          </details>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function BomPanel({
  design,
  onInteract,
  previewActive,
  total,
}: {
  design: ReferenceDesign;
  onInteract: () => void;
  previewActive: boolean;
  total: UsdRange | null;
}) {
  return (
    <article
      className={`panel ${previewActive ? 'preview-panel' : ''}`}
      id="bom-panel"
      role="region"
      tabIndex={0}
      aria-label="BOM and cost review"
      onClick={onInteract}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onInteract();
        }
      }}
    >
      <p className="eyebrow">BOM and cost {previewActive ? 'preview' : ''}</p>
      <h2>{total == null ? 'Cost review required' : `${formatUsdRange(total)} open estimate`}</h2>
      <p className="muted">
        {previewActive
          ? 'Preview only: values below are projected backend panel data and are not persisted yet.'
          : 'Ranges are explicit local estimates or review-required placeholders, not supplier quotes.'}
      </p>
      <div className="bom-list">
        {design.bom.length === 0 ? (
          <EmptyPanelNotice title="No BOM items yet">Import a richer project or connect the backend seed so cost ranges, lead-time estimates, and review-required supplier fields appear here.</EmptyPanelNotice>
        ) : design.bom.map((item) => (
          <div key={item.id}>
            <strong>{item.quantity}x {item.item}</strong>
            <small>
              {item.source} - {item.unitCostRangeUsd == null ? 'cost review required' : `${formatUsdRange(item.unitCostRangeUsd)} each`} -{' '}
              {formatLeadTimeRange(item.leadTimeRange)}
            </small>
          </div>
        ))}
      </div>
    </article>
  );
}

function ManufacturingPanel({
  design,
  onInteract,
  previewActive,
  selectedPartId,
}: {
  design: ReferenceDesign;
  onInteract: () => void;
  previewActive: boolean;
  selectedPartId: string;
}) {
  const selectedPartName = design.assemblies.flatMap((assembly) => assembly.parts).find((part) => part.id === selectedPartId)?.name;
  return (
    <article
      className={`panel ${previewActive ? 'preview-panel' : ''}`}
      id="manufacturing-panel"
      role="region"
      tabIndex={0}
      aria-label="Manufacturing review"
      onClick={onInteract}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onInteract();
        }
      }}
    >
      <p className="eyebrow">Manufacturing panel {previewActive ? 'preview' : ''}</p>
      <h2>Make or buy paths</h2>
      <p className="muted">
        Active process cards mirror backend manufacturing options. Cost and lead time stay ranged and review-required.
      </p>
      <div className="option-stack">
        {design.manufacturingOptions.length === 0 ? (
          <EmptyPanelNotice title="No manufacturing options yet">Connect backend panel data or import a demo project with make or buy process options before manufacturing review.</EmptyPanelNotice>
        ) : design.manufacturingOptions.map((option) => {
          const activeForSelected = option.partName === selectedPartName;
          return (
            <div className={`manufacturing-card ${activeForSelected ? 'selected-manufacturing' : ''}`} key={option.id}>
              <strong>{option.label}</strong>
              <span>{option.process}{activeForSelected ? ' - selected part option' : ''}</span>
              <small>{option.costDisplay} - {option.leadTime}</small>
              <p>{option.riskNote}</p>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function ReportPanel({ reports, selectedOption }: { reports: AdvisoryReport[]; selectedOption?: MaterialOption }) {
  const previewReport: AdvisoryReport | undefined = selectedOption
    ? {
        id: selectedOption.backendModification.payload.id,
        title: selectedOption.backendModification.reportTitle,
        status: selectedOption.backendModification.reportStatus,
        summary: selectedOption.backendModification.reportSummary,
        risks: [selectedOption.manufacturingImpact, selectedOption.wiringImpact],
        recommendations: ['Queue mass properties, payload re-rating, wiring clearance, and manufacturing report workers.'],
        unknowns: ['CAD geometry, fatigue life, supplier price, and harness clearance are still advisory.'],
      }
    : undefined;
  const visibleReports = previewReport ? [previewReport, ...reports] : reports;

  return (
    <article className="panel" id="reports-panel">
      <p className="eyebrow">Reports</p>
      <h2>Advisory edit report</h2>
      <div className="option-stack">
        {visibleReports.length === 0 ? (
          <EmptyPanelNotice title="No advisory reports yet">Preview a material substitution or import a project file with cached report metadata to create review evidence.</EmptyPanelNotice>
        ) : visibleReports.map((report) => (
          <div className="report-card" key={report.id}>
            <strong>{report.title}</strong>
            <small>{report.status.replaceAll('_', ' ')}</small>
            <p>{report.summary}</p>
            <ul>
              {report.risks.slice(0, 2).map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
              {report.recommendations.slice(0, 1).map((recommendation) => (
                <li key={recommendation}>{recommendation}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </article>
  );
}

function BackendContractPanel({ design }: { design: ReferenceDesign }) {
  const endpointBase = design.backend.apiBaseUrl ?? 'configured backend URL';
  const endpoints = [
    '/api/metadata',
    '/api/catalog/seed',
    '/api/projects/sample',
    design.backend.endpoint,
    `/api/projects/${design.backend.projectId}/analysis-readiness/${design.assembly.parts[0]?.id ?? 'part-id'}`,
    `/api/projects/${design.backend.projectId}/analysis-readiness/previews`,
    `/api/projects/${design.backend.projectId}/wiring-electronics`,
    `/api/projects/${design.backend.projectId}/wiring-review`,
    `/api/projects/${design.backend.projectId}/electronics-components`,
    `/api/projects/${design.backend.projectId}/wire-segments`,
    `/api/projects/${design.backend.projectId}/wiring-rules`,
    `/api/projects/${design.backend.projectId}/analysis-jobs/pre-solver-runs`,
    `/api/projects/${design.backend.projectId}/analysis-jobs/solver-readiness-runs`,
    '/api/local-analysis/solver-readiness',
    `/api/projects/${design.backend.projectId}/parts/${design.assembly.parts[0]?.id ?? 'part-id'}/material-substitutions`,
    `/api/projects/${design.backend.projectId}/material-substitutions/preview`,
    `/api/projects/${design.backend.projectId}/material-substitutions/apply`,
    '/api/local-analysis/tool-boundaries',
    `/api/projects/${design.backend.projectId}/modifications`,
  ];

  return (
    <article className="panel">
      <p className="eyebrow">Backend contract</p>
      <h2>Ready for API handoff</h2>
      <p>{design.backend.advisoryNotice}</p>
      <div className="endpoint-list">
        {endpoints.map((endpoint) => (
          <code key={endpoint}>{endpointBase}{endpoint}</code>
        ))}
      </div>
      <small>Worker stubs: {design.backend.integrationStubs.join(', ')}</small>
    </article>
  );
}

const wiringStatusCopy: Record<NonNullable<ReferenceDesign['wiringReview']>['status'], string> = {
  pass: 'Passes heuristic screen',
  warning: 'Warning',
  review_required: 'Review required',
};

function WiringPanel({ design, onInteract, selectedPart }: { design: ReferenceDesign; onInteract: () => void; selectedPart: Part }) {
  const relatedRoutes = design.wiringRoutes.filter((route) =>
    route.connectedParts.includes(selectedPart.id) || selectedPart.relatedWires.includes(route.id),
  );
  const relatedComponentIds = new Set(relatedRoutes.flatMap((route) => route.electronicsComponentIds));
  const relatedComponents = design.electronicsComponents.filter((component) =>
    component.mountedPartId === selectedPart.id || relatedComponentIds.has(component.id),
  );
  const relatedSegmentIds = new Set(relatedRoutes.flatMap((route) => route.wireSegmentIds));
  const relatedSegments = design.wireSegments.filter((segment) => relatedSegmentIds.has(segment.id));
  const relatedBomIds = new Set([
    ...relatedRoutes.flatMap((route) => route.harnessBom),
    ...relatedSegments.map((segment) => segment.bomItemId).filter((value): value is string => value != null),
    ...relatedComponents.flatMap((component) => component.bomItemIds),
  ]);
  const relatedBom = design.bom.filter((item) => relatedBomIds.has(item.id));
  const selectedRoute = relatedRoutes[0] ?? design.wiringRoutes[0];

  return (
    <article
      className="panel wiring-workflow-panel"
      id="wiring-panel"
      role="region"
      tabIndex={0}
      aria-label="Wiring and electronics workflow"
      onClick={onInteract}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onInteract();
        }
      }}
    >
      <p className="eyebrow">Wiring and electronics</p>
      <h2>{design.wiringReview ? wiringStatusCopy[design.wiringReview.status] : 'Harness review required'}</h2>
      <p className="muted">
        {design.wiringReview?.summary
          ?? 'Harness routes are visible, but the backend has not supplied a deterministic review result yet.'}
      </p>
      <div className="wiring-diagram" aria-label="Simple wiring route diagram">
        <div className="diagram-node controller">Controller</div>
        <div className="diagram-node joint">Joint service</div>
        <div className="diagram-node tool">Tool</div>
        {design.wiringRoutes.slice(0, 4).map((route, index) => (
          <span
            className={`diagram-route route-${index} status-${route.reviewStatus}`}
            key={route.id}
            title={`${route.name}: ${wiringStatusCopy[route.reviewStatus]}`}
          />
        ))}
      </div>
      {selectedRoute ? (
        <div className={`wiring-card featured-route status-${selectedRoute.clearanceStatus}`}>
          <strong>{selectedRoute.name}</strong>
          <small>{wiringStatusCopy[selectedRoute.reviewStatus]} - {selectedRoute.reviewSummary}</small>
          <dl className="meta-grid compact">
            <div>
              <dt>Route length</dt>
              <dd>{selectedRoute.pathLengthMm == null ? 'review required' : `${formatMeasurement(selectedRoute.pathLengthMm)} mm polyline estimate`}</dd>
            </div>
            <div>
              <dt>Clearance</dt>
              <dd>{selectedRoute.clearanceMm == null ? 'review required' : `${formatMeasurement(selectedRoute.clearanceMm)} mm heuristic`}</dd>
            </div>
            <div>
              <dt>Bend radius</dt>
              <dd>{selectedRoute.bendRadiusMm == null ? 'review required' : `${formatMeasurement(selectedRoute.bendRadiusMm)} mm heuristic`}</dd>
            </div>
            <div>
              <dt>Service loop</dt>
              <dd>{selectedRoute.serviceLoopMm == null ? 'review required' : `${formatMeasurement(selectedRoute.serviceLoopMm)} mm recorded slack`}</dd>
            </div>
          </dl>
          <div className="connector-list">
            {selectedRoute.connectors.map((connector) => (
              <div key={connector.id}>
                <strong>{connector.name}</strong>
                <small>
                  {connector.pinCount ?? '?'} pins - {connector.gender} - {connector.voltageRatingV ?? '?'} V - {connector.currentRatingA ?? '?'} A
                </small>
                <small>{connector.pinLabels.slice(0, 6).join(', ') || 'pin labels review required'}</small>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {relatedRoutes.length > 0 ? (
        <div className="option-stack">
          {relatedRoutes.map((route) => (
            <div className={`wiring-card status-${route.clearanceStatus}`} key={route.id}>
              <strong>{route.name}</strong>
              <small>
                {wiringStatusCopy[route.reviewStatus]} - {route.bendRadiusMm == null ? 'bend radius review required' : `${route.bendRadiusMm} mm bend`} -{' '}
                {route.clearanceMm == null ? 'clearance review required' : `${route.clearanceMm} mm clearance`}
              </small>
              <p>{route.note}</p>
              <details>
                <summary>Evidence</summary>
                <ul>
                  {route.evidence.slice(0, 6).map((item) => (
                    <li key={`${route.id}-${item.check}`}>
                      <strong>{item.check}</strong>: {item.status.replaceAll('_', ' ')} - {item.message}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      ) : (
        <p>No directly related wiring constraints for this selected part.</p>
      )}
      <div className="wiring-context-grid">
        <section>
          <h3>Linked electronics</h3>
          {relatedComponents.length > 0 ? relatedComponents.map((component) => (
            <p key={component.id}>
              <strong>{component.name}</strong><br />
              <small>{component.componentType} on {component.mountedPartId ?? 'assembly'} - {component.confidence.replaceAll('_', ' ')}</small>
            </p>
          )) : <p className="muted">No electronics component is directly linked to this part yet.</p>}
        </section>
        <section>
          <h3>Wire segments</h3>
          {relatedSegments.length > 0 ? relatedSegments.map((segment) => (
            <p key={segment.id}>
              <strong>{segment.name}</strong><br />
              <small>
                {segment.conductorCount ?? '?'} conductors, {segment.wireGaugeAwg == null ? 'AWG review required' : `${segment.wireGaugeAwg} AWG`},{' '}
                {segment.lengthMm == null ? 'length review required' : `${formatMeasurement(segment.lengthMm)} mm estimated`}
              </small>
            </p>
          )) : <p className="muted">No wire segment is directly linked to this part yet.</p>}
        </section>
        <section>
          <h3>BOM additions</h3>
          {relatedBom.length > 0 ? relatedBom.map((item) => (
            <p key={item.id}>
              <strong>{item.quantity}x {item.item}</strong><br />
              <small>{item.source} - {item.unitCostRangeUsd == null ? 'cost review required' : `${formatUsdRange(item.unitCostRangeUsd)} heuristic`}</small>
            </p>
          )) : <p className="muted">Harness BOM linkage is review-required for this selection.</p>}
        </section>
      </div>
      {design.wiringReview ? (
        <details className="review-assumptions">
          <summary>Heuristic scope and review-required checks</summary>
          <ul>{design.wiringReview.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      ) : null}
    </article>
  );
}

export default App;
