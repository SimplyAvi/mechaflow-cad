import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import {
  applyMaterialSubstitution,
  exportProjectFile,
  importProjectFile,
  importLocalProjectFile,
  loadCockpitDesign,
  loadLocalSolverReadiness,
  previewMaterialSubstitution,
  runLocalPreSolverAnalysis,
  runLocalSolverReadinessAnalysis,
  type MaterialSubstitutionResult,
} from './lib/api';
import type { AdvisoryReport, Assembly, LocalSolverReadinessSummary, MaterialOption, Part, ReferenceDesign, UsdRange } from './types';
import { readyExamples, buildReadyExampleDesign, isolateOfflineDesign, type ReadyExampleId } from './data/readyExamples';
import { mockReferenceDesign } from './data/mockDesign';
import { extractDesignIntentChips, taskFromDesignIntent, type DesignIntentChip } from './lib/designIntent';
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

const chipCopy = (chip: DesignIntentChip): string => `${chip.label}: ${chip.detail}`;

function App() {
  const [design, setDesign] = useState<ReferenceDesign | null>(null);
  const [selectedAssemblyId, setSelectedAssemblyId] = useState('');
  const [selectedPartId, setSelectedPartId] = useState('part-palm-plate');
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [explodePercent, setExplodePercent] = useState(100);
  const [rotationDeg, setRotationDeg] = useState(18);
  const [orbitPitchDeg, setOrbitPitchDeg] = useState(10);
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
  const [intentText, setIntentText] = useState('');
  const [intentMessage, setIntentMessage] = useState<string | null>('Robot arm demo is loaded. Describe a new mechanism or add a reference image to start faster.');
  const [referenceImages, setReferenceImages] = useState<ReferenceImageRecord[]>([]);
  const [imageDropActive, setImageDropActive] = useState(false);
  const [speechState, setSpeechState] = useState<SpeechState>('idle');
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
    setDownstreamPanelsReviewed({ bom: false, manufacturing: false, wiring: false });
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

  const materialCriterion = selectedPart?.designCriteria.find((criterion) => criterion.id === 'elasticity-stiffness');

  const materialOptions = useMemo(
    () => design?.materialOptions.filter((option) => option.partId === selectedPart?.id) ?? [],
    [design, selectedPart?.id],
  );

  const selectedOption = materialOptions.find((option) => option.id === selectedOptionId) ?? materialOptions[0];

  const intentChips = useMemo(() => extractDesignIntentChips(intentText), [intentText]);

  const selectPart = (partId: string) => {
    setSelectedPartId(partId);
    setSubstitutionPreview(null);
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
    const nextDesign: ReferenceDesign = isolateOfflineDesign({
      ...conceptDesign,
      id: 'local-design-intent-concept',
      name: 'New mechanism concept from prompt',
      sourceUrl: null,
      license: 'Local concept seed, no external CAD asset',
      formats: ['Prompt intent', 'Reference images metadata', 'Proxy 3D viewport'],
      task: conceptTask,
      backend: {
        ...localBackend,
        projectId: 'local-design-intent-concept',
        source: 'bundled-mock',
        endpoint: 'local prompt concept, proxy geometry reused from bundled mock data',
        advisoryNotice: 'This project was started from typed design intent. The viewport is an interactive concept proxy until real CAD generation, reconstruction, and FEA workers are connected.',
      },
      analysisJobs: [],
      reports: [],
      wiringReview: null,
    }, 'local-design-intent-concept');
    applyLoadedDesign(nextDesign);
    rememberRecentProject(nextDesign, trimmedIntent, referenceImages);
    setWorkspaceMode('design');
    setSubstitutionPreview(null);
    setIntentMessage('Started a concept workspace from your prompt. The 3D viewport is a proxy rendering, not generated CAD or photo reconstruction.');
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
    if (!design?.backend.apiBaseUrl) {
      setProjectFileMessage('Start the desktop demo with a local backend or mock API to export a portable project file.');
      return;
    }
    const requestVersion = projectLoadVersion.current;
    setProjectFilePending(true);
    setProjectFileMessage('Preparing portable MechaFlow project file...');
    try {
      const projectFile = await exportProjectFile(design.backend.apiBaseUrl, design.backend.projectId);
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
        setProjectFileMessage(`Exported ${projectFile.project.name} as ${link.download}. Re-import it to complete the round trip.`);
      }
    } catch (error) {
      console.warn('Project export failed.', error);
      if (projectLoadVersion.current === requestVersion) {
        setProjectFileMessage('Project export failed. Check that the backend supports MechaFlow project files.');
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
      id: 'select-part',
      label: 'Select and inspect parts',
      status: demoStepReviews.has('select-part') ? 'complete' : 'available',
      summary: `${activeAssembly.parts.length} selectable mechanical and electrical parts are available in ${activeAssembly.name}.`,
      anchor: '#assembly-viewer',
      actionLabel: 'Open viewer',
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
      status: hasExportOrImport
        ? 'complete'
        : design.backend.apiBaseUrl ? 'available' : 'unavailable',
      summary: design.backend.apiBaseUrl
        ? 'Export a .mfcad.json evidence package, then import it again to prove the round trip.'
        : 'Project file import and export need a local API connection.',
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
    <main className="app-shell input-first-shell">
      <header className="workspace-topbar">
        <div className="brand-block">
          <span className="app-mark" aria-hidden="true">MF</span>
          <div>
            <p className="eyebrow">MechaFlow CAD</p>
            <h1>Start with intent, then refine the model.</h1>
            <p>
              A robotics CAD cockpit with the 3D view first. Type a prompt, add reference images, open a project,
              or load a ready local example before switching into analysis and manufacturing tools.
            </p>
          </div>
        </div>
        <nav className="tool-rail" aria-label="Workspace tool modes">
          {workspaceModes.map((mode) => (
            <button
              aria-pressed={workspaceMode === mode.id}
              className={workspaceMode === mode.id ? 'active' : ''}
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

      <section className="project-cockpit" aria-label="Input-first CAD cockpit">
        <aside className="panel cad-sidebar project-browser" id="project-browser" aria-label="Project and example browser">
          <p className="eyebrow">Project browser</p>
          <h2>Start small</h2>
          <p className="sidebar-copy">Choose one path. Everything else stays tucked into tool modes until the model needs it.</p>
          <div className="quick-start-stack">
            <button className="primary-start" onClick={() => createProjectFromIntent()} type="button">
              <span>New from prompt</span>
              <small>Uses the command line below and keeps the first render as a proxy concept.</small>
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
          <section className="viewer-card panel primary-viewer" id="assembly-viewer" aria-label="Interactive 3D rendering workspace">
            <div className="viewer-toolbar">
              <div>
                <p className="eyebrow">Interactive 3D rendering</p>
                <h2>{activeAssembly.name}</h2>
                <small>Orbit the proxy assembly, explode the view, or select a part to update the inspector.</small>
              </div>
              <div className="viewer-controls" aria-label="3D view controls">
                <button type="button" onClick={() => setExplodePercent((value) => (value > 0 ? 0 : 100))}>
                  {explodePercent > 0 ? 'Collapse' : 'Explode'}
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
                    max="42"
                    min="-18"
                    onChange={(event) => setOrbitPitchDeg(Number(event.target.value))}
                    type="range"
                    value={orbitPitchDeg}
                  />
                </label>
              </div>
            </div>
            <div className="viewer-stage" role="img" aria-label="Interactive exploded view of a robot arm assembly">
              <div className="reach-envelope" aria-hidden="true" />
              <div
                className="assembly-rotor"
                style={{
                  '--rotation-deg': `${rotationDeg}deg`,
                  '--orbit-pitch-deg': `${orbitPitchDeg}deg`,
                } as CSSProperties}
              >
                <div className="wire wire-main" />
                <div className="wire wire-left" />
                <div className="wire wire-wrist" />
                {activeAssembly.parts.map((part) => {
                  const explodeScale = explodePercent / 100;
                  return (
                    <button
                      aria-pressed={part.id === selectedPart.id}
                      className={`part-shape shape-${part.visual.shape ?? 'plate'} risk-${part.stressRisk} ${part.id === selectedPart.id ? 'selected' : ''}`}
                      key={part.id}
                      onClick={() => selectPart(part.id)}
                      style={{
                        '--x': `${part.visual.x}%`,
                        '--y': `${part.visual.y}%`,
                        '--w': `${part.visual.width}%`,
                        '--h': `${part.visual.height}%`,
                        '--tx': `${part.visual.explodeX * explodeScale}%`,
                        '--ty': `${part.visual.explodeY * explodeScale}%`,
                        '--part-color': part.visual.color,
                        '--part-rotation': `${part.visual.rotationDeg ?? 0}deg`,
                        '--part-z': part.visual.zIndex ?? 2,
                      } as CSSProperties}
                      type="button"
                    >
                      <span>{part.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="viewer-footer">
              <span>
                Exploded-view data:{' '}
                {activeAssembly.explodedProgress == null ? 'review required' : `${activeAssembly.explodedProgress}% demo transforms ready`} - explode {explodePercent}%
              </span>
              <span>Orbit yaw {rotationDeg} degrees, pitch {orbitPitchDeg} degrees. Harness routes are visual references under review.</span>
            </div>
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
            <section className="panel design-overview" aria-label="Design mode summary">
              <p className="eyebrow">Design mode</p>
              <h2>Model first, tools when needed</h2>
              <div className="mode-summary-grid">
                <div>
                  <strong>{activeAssembly.parts.length}</strong>
                  <span>selectable parts</span>
                </div>
                <div>
                  <strong>{materialOptions.length}</strong>
                  <span>material options for selected part</span>
                </div>
                <div>
                  <strong>{referenceImages.length}</strong>
                  <span>reference images</span>
                </div>
              </div>
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
                    canUseProjectFiles={Boolean(design.backend.apiBaseUrl)}
                    message={projectFileMessage}
                    onExport={exportCurrentProjectFile}
                    onImport={importCurrentProjectFile}
                    pending={projectFilePending}
                    projectId={design.backend.projectId}
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
                {selectedPart.material}
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
        <small>JSON v1 preserves project {projectId}, assemblies, wiring, materials, analysis readiness, and artifacts.</small>
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
          ? 'Use this to save, share, and reopen the local desktop demo project.'
          : 'Bundled offline mock data is read-only. Start the backend or desktop mock API for import and export.'}
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
