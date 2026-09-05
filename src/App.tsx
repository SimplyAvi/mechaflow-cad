import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from 'react';
import {
  applyMaterialSubstitution,
  exportProjectFile,
  importProjectFile,
  loadCockpitDesign,
  loadLocalSolverReadiness,
  previewMaterialSubstitution,
  runLocalPreSolverAnalysis,
  runLocalSolverReadinessAnalysis,
  type MaterialSubstitutionResult,
} from './lib/api';
import type { AdvisoryReport, Assembly, LocalSolverReadinessSummary, MaterialOption, Part, ReferenceDesign, UsdRange } from './types';
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

  const applyLoadedDesign = (loadedDesign: ReferenceDesign) => {
    setDesign(loadedDesign);
    setSelectedAssemblyId(loadedDesign.assembly.id);
    setSelectedPartId(loadedDesign.assembly.parts[0]?.id ?? '');
    setSelectedOptionId(loadedDesign.materialOptions[0]?.id ?? '');
  };

  useEffect(() => {
    let cancelled = false;
    loadCockpitDesign().then((loadedDesign) => {
      if (!cancelled) {
        applyLoadedDesign(loadedDesign);
        if (loadedDesign.backend.apiBaseUrl) {
          loadLocalSolverReadiness(loadedDesign.backend.apiBaseUrl)
            .then((readiness) => {
              if (!cancelled) setSolverReadiness(readiness);
            })
            .catch((error) => {
              console.warn('Local solver readiness endpoint is unavailable.', error);
              if (!cancelled) setSolverReadiness(null);
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

  const selectPart = (partId: string) => {
    setSelectedPartId(partId);
    setSubstitutionPreview(null);
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

  const runMaterialSubstitutionAction = async (action: 'preview' | 'apply') => {
    if (!design?.backend.apiBaseUrl || !selectedOption) {
      setSubstitutionMessage('Start the local backend to preview or apply a persisted material substitution. Offline mock data is read-only.');
      return;
    }
    setSubstitutionPending(true);
    setSubstitutionMessage(action === 'preview' ? 'Requesting non-persisted substitution preview...' : 'Applying validated substitution to the project...');
    try {
      const result = action === 'preview'
        ? await previewMaterialSubstitution(design.backend.apiBaseUrl, design.backend.projectId, selectedOption)
        : await applyMaterialSubstitution(design.backend.apiBaseUrl, design.backend.projectId, selectedOption);
      if (result.persisted) {
        setDesign(result.design);
        setSubstitutionPreview(null);
        setSelectedOptionId('');
        setSubstitutionMessage('Applied substitution to the backend project. BOM, manufacturing, readiness, and reports were reloaded from persisted state.');
      } else {
        setSubstitutionPreview(result);
        setSubstitutionMessage('Preview only: BOM, manufacturing, readiness, and reports below show projected effects. Project is unchanged until Apply is clicked.');
      }
    } catch (error) {
      console.warn('Material substitution failed.', error);
      setSubstitutionPreview(null);
      setSubstitutionMessage(error instanceof Error ? error.message : 'Material substitution failed compatibility validation.');
    } finally {
      setSubstitutionPending(false);
    }
  };

  const runSelectedPartPreSolver = async () => {
    if (!design?.backend.apiBaseUrl || !selectedPart) {
      setAnalysisRunMessage('Start the local backend with VITE_API_BASE_URL to run a persisted pre-solver job.');
      return;
    }
    setAnalysisRunPending(true);
    setAnalysisRunMessage('Running local pre-solver screening...');
    try {
      const job = await runLocalPreSolverAnalysis(
        design.backend.apiBaseUrl,
        design.backend.projectId,
        selectedPart.id,
      );
      setDesign((current) => current && {
        ...current,
        analysisJobs: [job, ...current.analysisJobs.filter((candidate) => candidate.id !== job.id)],
      });
      setAnalysisRunMessage('Local pre-solver job completed. Artifact is review-required and not FEA.');
    } catch (error) {
      console.warn('Local pre-solver run failed.', error);
      setAnalysisRunMessage('Local pre-solver job failed. Check the backend status and review-required details.');
    } finally {
      setAnalysisRunPending(false);
    }
  };

  const runSelectedPartSolverReadiness = async () => {
    if (!design?.backend.apiBaseUrl || !selectedPart) {
      setAnalysisRunMessage('Start the local backend with VITE_API_BASE_URL to run the solver-readiness fixture.');
      return;
    }
    setAnalysisRunPending(true);
    setAnalysisRunMessage('Running local solver-readiness fixture or preparing unavailable-tool artifacts...');
    try {
      const job = await runLocalSolverReadinessAnalysis(
        design.backend.apiBaseUrl,
        design.backend.projectId,
        selectedPart.id,
      );
      setDesign((current) => current && {
        ...current,
        analysisJobs: [job, ...current.analysisJobs.filter((candidate) => candidate.id !== job.id)],
      });
      const refreshed = await loadLocalSolverReadiness(design.backend.apiBaseUrl);
      setSolverReadiness(refreshed);
      setAnalysisRunMessage(
        job.status === 'solver-unavailable'
          ? 'Solver-readiness fixture prepared input artifacts, but CalculiX is unavailable. Install tools before a real fixture run.'
          : job.status === 'complete'
            ? 'Solver-readiness fixture completed with real CalculiX execution. It is still not project FEA.'
            : 'Solver-readiness fixture needs review. Inspect logs and artifact manifests below.',
      );
    } catch (error) {
      console.warn('Local solver-readiness fixture failed.', error);
      setAnalysisRunMessage('Local solver-readiness fixture failed. Check logs and review-required details.');
    } finally {
      setAnalysisRunPending(false);
    }
  };

  const exportCurrentProjectFile = async () => {
    if (!design?.backend.apiBaseUrl) {
      setProjectFileMessage('Start the desktop demo with a local backend or mock API to export a portable project file.');
      return;
    }
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
      setProjectFileMessage(`Exported ${projectFile.project.name} as ${link.download}.`);
    } catch (error) {
      console.warn('Project export failed.', error);
      setProjectFileMessage('Project export failed. Check that the backend supports MechaFlow project files.');
    } finally {
      setProjectFilePending(false);
    }
  };

  const importCurrentProjectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!design?.backend.apiBaseUrl) {
      setProjectFileMessage('Start the desktop demo with a local backend or mock API to import a project file.');
      return;
    }
    setProjectFilePending(true);
    setProjectFileMessage(`Opening ${file.name}...`);
    try {
      const text = await file.text();
      const projectFile = JSON.parse(text) as unknown;
      const importedDesign = await importProjectFile(design.backend.apiBaseUrl, projectFile);
      applyLoadedDesign(importedDesign);
      setProjectFileMessage(`Opened ${importedDesign.name} from ${file.name}.`);
    } catch (error) {
      console.warn('Project import failed.', error);
      const message = error instanceof SyntaxError
        ? 'Project import failed: file is not valid JSON.'
        : 'Project import failed: malformed or unsupported MechaFlow project file.';
      setProjectFileMessage(message);
    } finally {
      setProjectFilePending(false);
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

  return (
    <main className="app-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">Analysis-ready visual MVP</p>
          <h1>Robot arm CAD review cockpit</h1>
          <p className="hero-copy">
            Open the desktop-style demo, orbit a robot arm assembly, explode or collapse the mechanism, select
            individual parts, and read explicit pre-solver load cases, stiffness guidance, thermal limits, and
            review-required notes before full FreeCAD, Gmsh, and CalculiX project FEA workers exist.
          </p>
        </div>
        <div className="task-card" aria-label="Preserved task">
          <span>Preserved task</span>
          <strong>{design.task.label}</strong>
          <small>
            Target: {design.task.targetPayloadLb == null ? 'payload unknown' : `${design.task.targetPayloadLb} lb`},{' '}
            {design.task.cycleTimeSeconds == null ? 'cycle unknown' : `${design.task.cycleTimeSeconds}s cycle`},{' '}
            {design.task.reachMeters == null ? 'reach unknown' : `${design.task.reachMeters}m reach`}
          </small>
          <small>
            Data source: {design.backend.source.replaceAll('-', ' ')} via {design.backend.endpoint}
          </small>
        </div>
      </header>

      <section className="cockpit-grid" aria-label="Assembly cockpit">
        <aside className="panel reference-panel">
          <p className="eyebrow">Reference design</p>
          <h2>{design.name}</h2>
          <dl className="meta-grid">
            <div>
              <dt>License</dt>
              <dd>{design.license}</dd>
            </div>
            <div>
              <dt>Formats</dt>
              <dd>{design.formats.length > 0 ? design.formats.join(', ') : 'Review required'}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {design.sourceUrl ? <a href={design.sourceUrl}>Open catalog entry</a> : 'Review required'}
              </dd>
            </div>
          </dl>
          <div className="backend-summary">
            <strong>Backend handoff mirrored</strong>
            <small>Project {design.backend.projectId}</small>
            <small>{design.backend.concepts.slice(0, 5).join(', ')}</small>
          </div>
          <ProjectFilePanel
            canUseProjectFiles={Boolean(design.backend.apiBaseUrl)}
            message={projectFileMessage}
            onExport={exportCurrentProjectFile}
            onImport={importCurrentProjectFile}
            pending={projectFilePending}
            projectId={design.backend.projectId}
          />
          {selectableAssemblies.length > 1 ? (
            <AssemblySelector
              assemblies={selectableAssemblies}
              selectedAssemblyId={activeAssembly.id}
              onSelect={selectAssembly}
            />
          ) : null}
          <PartTree parts={activeAssembly.parts} selectedPartId={selectedPart.id} onSelect={selectPart} />
        </aside>

        <section className="viewer-card panel">
          <div className="viewer-toolbar">
            <div>
              <p className="eyebrow">Interactive robot assembly</p>
              <h2>{activeAssembly.name}</h2>
              <small>Click any highlighted mechanical or electrical part to update the inspector.</small>
            </div>
            <div className="viewer-controls" aria-label="Exploded view controls">
              <button type="button" onClick={() => setExplodePercent((value) => (value > 0 ? 0 : 100))}>
                {explodePercent > 0 ? 'Collapse assembly' : 'Explode assembly'}
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
            <span>Orbit yaw {rotationDeg} degrees, pitch {orbitPitchDeg} degrees. Blue lines are harness routes under review.</span>
          </div>
        </section>

        <aside className="panel inspector-panel">
          <p className="eyebrow">Part inspector</p>
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
              <dt>Stress risk (demo heuristic)</dt>
              <dd>{riskLabel[selectedPart.stressRisk]}</dd>
            </div>
          </dl>
          <CapabilityCard
            rating={activeRating}
            safetyFactorMin={design.task.safetyFactorMin ?? null}
            targetPayloadLb={design.task.targetPayloadLb}
          />
          <StrengthInfoPanel part={selectedPart} />
          <PreSolverReadinessPanel readiness={activeAssembly.analysisReadiness} title="Assembly readiness" />
          <PreSolverReadinessPanel readiness={selectedPart.analysisReadiness} title="Part readiness" />
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
        </aside>
      </section>

      <section className="insight-grid" aria-label="Analysis and delivery panels">
        <AnalysisPanel
          design={design}
          onRunPreSolver={runSelectedPartPreSolver}
          onRunSolverReadiness={runSelectedPartSolverReadiness}
          runMessage={analysisRunMessage}
          runPending={analysisRunPending}
          selectedPart={selectedPart}
          solverReadiness={solverReadiness}
        />
        <BomPanel design={visibleDesign} previewActive={Boolean(substitutionPreview)} total={visibleBomTotal} />
        <ManufacturingPanel design={visibleDesign} previewActive={Boolean(substitutionPreview)} selectedPartId={selectedPart.id} />
        <WiringPanel design={visibleDesign} selectedPart={selectedPart} />
        <ReportPanel reports={visibleDesign.reports} selectedOption={substitutionPreview?.option ?? selectedOption} />
        <BackendContractPanel design={design} />
      </section>

      <section className="panel foundation-note">
        <p className="eyebrow">Replaceable UI foundation</p>
        <p>
          Styling is intentionally local CSS with design tokens at the top of <code>src/App.css</code>. A formal design
          system can replace these panels, cards, colors, and spacing later without changing the mocked product workflow.
        </p>
      </section>
    </main>
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
    <section className="project-file-panel" aria-label="Project file import and export">
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
    <article className="panel job-queue-panel">
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
        {design.analysisJobs.map((job) => {
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
  previewActive,
  total,
}: {
  design: ReferenceDesign;
  previewActive: boolean;
  total: UsdRange | null;
}) {
  return (
    <article className={`panel ${previewActive ? 'preview-panel' : ''}`}>
      <p className="eyebrow">BOM and cost {previewActive ? 'preview' : ''}</p>
      <h2>{total == null ? 'Cost review required' : `${formatUsdRange(total)} open estimate`}</h2>
      <p className="muted">
        {previewActive
          ? 'Preview only: values below are projected backend panel data and are not persisted yet.'
          : 'Ranges are explicit local estimates or review-required placeholders, not supplier quotes.'}
      </p>
      <div className="bom-list">
        {design.bom.map((item) => (
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
  previewActive,
  selectedPartId,
}: {
  design: ReferenceDesign;
  previewActive: boolean;
  selectedPartId: string;
}) {
  const selectedPartName = design.assemblies.flatMap((assembly) => assembly.parts).find((part) => part.id === selectedPartId)?.name;
  return (
    <article className={`panel ${previewActive ? 'preview-panel' : ''}`}>
      <p className="eyebrow">Manufacturing panel {previewActive ? 'preview' : ''}</p>
      <h2>Make or buy paths</h2>
      <p className="muted">
        Active process cards mirror backend manufacturing options. Cost and lead time stay ranged and review-required.
      </p>
      <div className="option-stack">
        {design.manufacturingOptions.map((option) => {
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
    <article className="panel">
      <p className="eyebrow">Reports</p>
      <h2>Advisory edit report</h2>
      <div className="option-stack">
        {visibleReports.map((report) => (
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

function WiringPanel({ design, selectedPart }: { design: ReferenceDesign; selectedPart: Part }) {
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
    <article className="panel wiring-workflow-panel" aria-label="Wiring and electronics workflow">
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
