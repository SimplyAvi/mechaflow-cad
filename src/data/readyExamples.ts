import readyExampleSeed from '../../data/ready-examples.seed.json';
import { mockReferenceDesign } from './mockDesign';
import type { AnalysisReadinessPreview, ReferenceDesign } from '../types';

export type ReadyExampleId = 'robot-arm-gripper' | 'compact-gantry-concept';

export interface ReadyExampleCard {
  id: ReadyExampleId;
  title: string;
  summary: string;
  intent: string;
  attribution: string;
  license: string;
}

export const readyExamples: ReadyExampleCard[] = readyExampleSeed as ReadyExampleCard[];

const cloneDesign = (design: ReferenceDesign): ReferenceDesign => JSON.parse(JSON.stringify(design)) as ReferenceDesign;

const resetReadiness = (
  readiness: AnalysisReadinessPreview,
  projectId: string,
  targetId: string,
  targetName: string,
  targetKind: 'part' | 'assembly',
): AnalysisReadinessPreview => ({
  ...readiness,
  project_id: projectId,
  target_id: targetId,
  target_name: targetName,
  target_kind: targetKind,
  state: 'review_required',
  trust_label: 'demo_estimate',
  summary: 'Local example readiness requires review; no backend analysis is attached.',
  criteria: [],
  load_cases: [],
  constraints: [],
  material_properties: null,
  solver_inputs: { units: 'SI', notes: ['Local example seed; solver inputs are not prepared.'] },
  expected_result_artifacts: [],
  solver_pipeline: [],
  demo_estimates: [],
  review_required: ['No backend solver readiness is attached to this local example.'],
  recommended_job_request: null,
  generated_at: undefined,
});

export const isolateOfflineDesign = (design: ReferenceDesign, projectId: string): ReferenceDesign => {
  const assemblies = design.assemblies.map((assembly) => {
    const parts = assembly.parts.map((part) => ({
      ...part,
      analysisReadiness: resetReadiness(part.analysisReadiness, projectId, part.id, part.name, 'part'),
    }));
    return {
      ...assembly,
      analysisReadiness: resetReadiness(assembly.analysisReadiness, projectId, assembly.id, assembly.name, 'assembly'),
      parts,
    };
  });
  const assembly = assemblies.find((candidate) => candidate.id === design.assembly.id) ?? assemblies[0] ?? design.assembly;
  return { ...design, assembly, assemblies, analysisJobs: [], reports: [], wiringReview: null };
};

export const buildReadyExampleDesign = (baseDesign: ReferenceDesign, exampleId: ReadyExampleId): ReferenceDesign => {
  const design = cloneDesign(mockReferenceDesign);
  if (exampleId === 'compact-gantry-concept') {
    const localBackend = { ...design.backend };
    delete localBackend.apiBaseUrl;
    return isolateOfflineDesign({
      ...design,
      id: 'project-compact-gantry-concept',
      name: 'Compact pick-and-place gantry concept',
      sourceUrl: null,
      license: 'MIT local demo seed, no external CAD asset',
      formats: ['MFCAD JSON concept seed', 'Proxy SVG viewport'],
      task: {
        ...design.task,
        label: 'Design a compact pick-and-place gantry for 8 lb payload, 0.45 m travel, 3 s cycle, aluminum frame, local-only analysis.',
        targetPayloadLb: 8,
        cycleTimeSeconds: 3,
        reachMeters: 0.45,
        serviceGoal: 'Reference-image intake and local-only analysis planning remain visible; proxy rendering is not generated CAD.',
        validationMethod: 'Local concept seed only; real CAD generation and FEA are not implemented in this slice.',
      },
      assembly: {
        ...design.assembly,
        id: 'assembly-compact-gantry-proxy',
        name: 'Compact gantry proxy assembly',
      },
      assemblies: design.assemblies.map((assembly, index) => index === 0 ? {
        ...assembly,
        id: 'assembly-compact-gantry-proxy',
        name: 'Compact gantry proxy assembly',
      } : assembly),
      backend: {
        ...localBackend,
        projectId: 'project-compact-gantry-concept',
        source: 'bundled-mock',
        endpoint: 'local concept seed, proxy geometry reused from bundled mock data',
        advisoryNotice: 'Compact gantry is a repository-local concept seed. The viewport is a proxy rendering until real CAD import or generation workers exist.',
      },
      analysisJobs: [],
      reports: [],
      wiringReview: null,
    }, 'project-compact-gantry-concept');
  }

  const localBackend = { ...design.backend };
  delete localBackend.apiBaseUrl;
  return isolateOfflineDesign({
    ...design,
    id: 'project-robot-arm-gripper-example',
    name: 'Robot arm gripper example',
    sourceUrl: null,
    license: 'MIT local demo seed, no external CAD asset',
    formats: Array.from(new Set([...design.formats, 'MFCAD JSON local demo seed'])),
    backend: {
      ...localBackend,
      projectId: 'project-robot-arm-gripper-example',
      source: 'bundled-mock',
      endpoint: 'local concept seed, proxy geometry reused from bundled mock data',
      advisoryNotice: `${design.backend.advisoryNotice} Ready example uses repository-local seed data and does not import external CAD assets.`,
    },
    analysisJobs: [],
    reports: [],
    wiringReview: null,
  }, 'project-robot-arm-gripper-example');
};
