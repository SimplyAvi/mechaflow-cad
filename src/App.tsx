import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { loadCockpitDesign } from './lib/api';
import type { AdvisoryReport, Assembly, MaterialOption, Part, ReferenceDesign, UsdRange } from './types';
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
  const [selectedPartId, setSelectedPartId] = useState('finger-link-left');
  const [selectedOptionId, setSelectedOptionId] = useState('ribbed-aluminum-left');
  const [isExploded, setIsExploded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadCockpitDesign().then((loadedDesign) => {
      if (!cancelled) {
        setDesign(loadedDesign);
        setSelectedAssemblyId(loadedDesign.assembly.id);
        setSelectedPartId(loadedDesign.assembly.parts[0]?.id ?? '');
        setSelectedOptionId(loadedDesign.materialOptions[0]?.id ?? '');
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

  const materialOptions = useMemo(
    () => design?.materialOptions.filter((option) => option.partId === selectedPart?.id) ?? [],
    [design, selectedPart?.id],
  );

  const selectedOption = materialOptions.find((option) => option.id === selectedOptionId) ?? materialOptions[0];

  useEffect(() => {
    if (materialOptions.length > 0 && !materialOptions.some((option) => option.id === selectedOptionId)) {
      setSelectedOptionId(materialOptions[0].id);
    }
  }, [materialOptions, selectedOptionId]);

  const selectAssembly = (assemblyId: string) => {
    const assembly = design?.assemblies.find((candidate) => candidate.id === assemblyId);
    if (!assembly) return;
    setSelectedAssemblyId(assembly.id);
    setSelectedPartId(assembly.parts[0]?.id ?? '');
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

  const bomTotal = totalBomCost(design.bom);
  const activeRating = selectedOption
    ? {
        payloadLb: selectedOption.payloadLb,
        safetyFactor: selectedOption.safetyFactor,
        status: selectedOption.status,
        summary: selectedOption.taskImpact,
      }
    : selectedPart.rating;

  return (
    <main className="app-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">MechaFlow CAD frontend foundation</p>
          <h1>Robot CAD orchestration cockpit</h1>
          <p className="hero-copy">
            Open a reference design, inspect an exploded assembly, preserve the task, and preview material,
            wiring, manufacturing, BOM, and analysis impact before FreeCAD workers exist.
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
          {selectableAssemblies.length > 1 ? (
            <AssemblySelector
              assemblies={selectableAssemblies}
              selectedAssemblyId={activeAssembly.id}
              onSelect={selectAssembly}
            />
          ) : null}
          <PartTree parts={activeAssembly.parts} selectedPartId={selectedPart.id} onSelect={setSelectedPartId} />
        </aside>

        <section className="viewer-card panel">
          <div className="viewer-toolbar">
            <div>
              <p className="eyebrow">Animated exploded view concept</p>
              <h2>{activeAssembly.name}</h2>
            </div>
            <button type="button" onClick={() => setIsExploded((value) => !value)}>
              {isExploded ? 'Collapse assembly' : 'Explode assembly'}
            </button>
          </div>
          <div className="viewer-stage" role="img" aria-label="Mock exploded view of a robot gripper assembly">
            <div className="wire wire-main" />
            <div className="wire wire-left" />
            {activeAssembly.parts.map((part) => (
              <button
                className={`part-shape risk-${part.stressRisk} ${part.id === selectedPart.id ? 'selected' : ''}`}
                key={part.id}
                onClick={() => setSelectedPartId(part.id)}
                style={{
                  '--x': `${part.visual.x}%`,
                  '--y': `${part.visual.y}%`,
                  '--w': `${part.visual.width}%`,
                  '--h': `${part.visual.height}%`,
                  '--tx': isExploded ? `${part.visual.explodeX}%` : '0%',
                  '--ty': isExploded ? `${part.visual.explodeY}%` : '0%',
                  '--part-color': part.visual.color,
                } as CSSProperties}
                type="button"
              >
                <span>{part.name}</span>
              </button>
            ))}
          </div>
          <div className="viewer-footer">
            <span>
              Exploded-view progress:{' '}
              {activeAssembly.explodedProgress == null ? 'review required' : `${activeAssembly.explodedProgress}%`}
            </span>
            <span>Blue lines show wiring routes and service-loop review state.</span>
          </div>
        </section>

        <aside className="panel inspector-panel">
          <p className="eyebrow">Part inspector</p>
          <h2>{selectedPart.name}</h2>
          <p>{selectedPart.purpose}</p>
          <dl className="meta-grid compact">
            <div>
              <dt>Material</dt>
              <dd>{selectedPart.material}</dd>
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
          <CapabilityCard rating={activeRating} targetPayloadLb={design.task.targetPayloadLb} />
          <MaterialSubstitution options={materialOptions} selectedOption={selectedOption} onSelect={setSelectedOptionId} />
          <ModificationPreview selectedOption={selectedOption} />
        </aside>
      </section>

      <section className="insight-grid" aria-label="Analysis and delivery panels">
        <AnalysisPanel design={design} />
        <BomPanel design={design} total={bomTotal} />
        <ManufacturingPanel design={design} />
        <WiringPanel design={design} selectedPart={selectedPart} />
        <ReportPanel reports={design.reports} selectedOption={selectedOption} />
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
  targetPayloadLb,
}: {
  rating: { status: 'passes' | 'watch' | 'fails'; payloadLb: number | null; safetyFactor: number | null; summary: string; warning?: string };
  targetPayloadLb: number | null;
}) {
  const hasRating = rating.payloadLb != null && rating.safetyFactor != null && targetPayloadLb != null;
  const delta = hasRating ? rating.payloadLb! - targetPayloadLb! : null;
  return (
    <div className={`capability-card status-${rating.status}`}>
      <span>{statusLabel[rating.status]}</span>
      <strong>{hasRating ? `${rating.payloadLb} lb projected rating` : 'Payload rating review required'}</strong>
      {hasRating && delta != null ? (
        <small>
          Safety factor {rating.safetyFactor!.toFixed(1)} - {delta >= 0 ? '+' : ''}
          {delta} lb against preserved task
        </small>
      ) : <small>Safety factor and payload delta are unknown.</small>}
      <p>{rating.summary}</p>
      {rating.warning ? <p className="warning">{rating.warning}</p> : null}
    </div>
  );
}

function MaterialSubstitution({
  options,
  selectedOption,
  onSelect,
}: {
  options: MaterialOption[];
  selectedOption?: MaterialOption;
  onSelect: (id: string) => void;
}) {
  if (options.length === 0) {
    return <p className="muted">No compatible substitution options are available; material and process compatibility review is required.</p>;
  }

  return (
    <div className="substitution-panel">
      <h3>Task-preserving material substitution</h3>
      <label htmlFor="material-option">Preview option</label>
      <select id="material-option" value={selectedOption?.id} onChange={(event) => onSelect(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.material} - {statusLabel[option.status]}
          </option>
        ))}
      </select>
      {selectedOption ? (
        <div className="option-impact">
          <p>{selectedOption.taskImpact}</p>
          <ul>
            <li>
              Weight change: {selectedOption.weightDeltaLb == null
                ? 'review required'
                : `${selectedOption.weightDeltaLb > 0 ? '+' : ''}${selectedOption.weightDeltaLb.toFixed(2)} lb`}
            </li>
            <li>
              Process cost: {selectedOption.costRangeUsd == null
                ? 'review required'
                : formatUsdRange(selectedOption.costRangeUsd)}
            </li>
            <li>{selectedOption.manufacturingImpact}</li>
            <li>{selectedOption.wiringImpact}</li>
          </ul>
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

function AnalysisPanel({ design }: { design: ReferenceDesign }) {
  return (
    <article className="panel">
      <p className="eyebrow">Background analysis status</p>
      <h2>Worker queue</h2>
      <div className="job-list">
        {design.analysisJobs.map((job) => (
          <div className="job-row" key={job.id}>
            <div>
              <strong>{job.name}</strong>
              <small>{job.worker}</small>
            </div>
            <div
              className="progress-track"
              aria-label={`${job.name} ${job.progress == null ? 'progress unknown' : `${job.progress}%`}`}
            >
              <span style={{ width: `${job.progress ?? 0}%` }} />
            </div>
            <span className={`job-status ${job.status}`}>{job.status}</span>
            <p>{job.summary}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function BomPanel({ design, total }: { design: ReferenceDesign; total: UsdRange | null }) {
  return (
    <article className="panel">
      <p className="eyebrow">BOM and cost</p>
      <h2>{total == null ? 'Cost review required' : `${formatUsdRange(total)} open estimate`}</h2>
      <div className="bom-list">
        {design.bom.map((item) => (
          <div key={item.id}>
            <strong>{item.quantity}x {item.item}</strong>
            <small>
              {item.source} - {item.unitCostRangeUsd == null ? 'cost review required' : `${formatUsdRange(item.unitCostRangeUsd)} each`} -{' '}
              {item.leadTimeDays == null ? 'lead time review required' : `${item.leadTimeDays} day lead`}
            </small>
          </div>
        ))}
      </div>
    </article>
  );
}

function ManufacturingPanel({ design }: { design: ReferenceDesign }) {
  return (
    <article className="panel">
      <p className="eyebrow">Manufacturing panel</p>
      <h2>Make or buy paths</h2>
      <div className="option-stack">
        {design.manufacturingOptions.map((option) => (
          <div className="manufacturing-card" key={option.id}>
            <strong>{option.label}</strong>
            <span>{option.process}</span>
            <small>{option.costDisplay} - {option.leadTime}</small>
            <p>{option.riskNote}</p>
          </div>
        ))}
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

function WiringPanel({ design, selectedPart }: { design: ReferenceDesign; selectedPart: Part }) {
  const relatedRoutes = design.wiringRoutes.filter((route) =>
    route.connectedParts.includes(selectedPart.id) || selectedPart.relatedWires.includes(route.id),
  );

  return (
    <article className="panel">
      <p className="eyebrow">Wiring awareness</p>
      <h2>Harness constraints</h2>
      {relatedRoutes.length > 0 ? (
        <div className="option-stack">
          {relatedRoutes.map((route) => (
            <div className={`wiring-card status-${route.clearanceStatus}`} key={route.id}>
              <strong>{route.name}</strong>
              <small>
                {route.bendRadiusMm == null ? 'Bend radius review required' : `Bend radius ${route.bendRadiusMm} mm`} - service loop{' '}
                {route.serviceLoop == null ? 'review required' : route.serviceLoop ? 'planned' : 'missing'}
              </small>
              <p>{route.note}</p>
            </div>
          ))}
        </div>
      ) : (
        <p>No directly related wiring constraints for this selected part.</p>
      )}
    </article>
  );
}

export default App;
