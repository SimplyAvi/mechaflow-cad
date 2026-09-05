#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import {
  mockBackendMetadata,
  mockBackendPanelData,
  mockCatalogSeed,
  mockReferenceDesigns,
  mockTaskRequirements,
} from './mock-backend-data.mjs';
import { getFreePort, parsePort } from './port-utils.mjs';

const host = process.env.BACKEND_HOST || process.env.MECHAFLOW_API_HOST || '127.0.0.1';
const configuredPort = parsePort(
  process.env.BACKEND_PORT || process.env.MECHAFLOW_API_PORT || process.env.API_PORT,
  'BACKEND_PORT',
);
const port = configuredPort ?? (await getFreePort(host));
const defaultCorsOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'];
const configuredCorsOrigins = process.env.MECHAFLOW_CORS_ORIGINS?.trim();
const corsOrigins = new Set(
  (configuredCorsOrigins || defaultCorsOrigins.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
let projectId = mockBackendPanelData.project.id;
let project = structuredClone(mockBackendPanelData.project);
let analysisReadinessPreviews = structuredClone(mockBackendPanelData.analysis_readiness_previews ?? []);
const editableDimensionFields = new Set(['length_mm', 'width_mm', 'height_mm', 'thickness_mm']);
const modificationFields = new Set([
  'id',
  'target_part_id',
  'description',
  'material_id',
  'dimension_changes',
  'manufacturing_process',
  'created_at',
]);
const manufacturingProcesses = new Set([
  'off_the_shelf',
  'additive_fdm',
  'additive_sls',
  'cnc_machining',
  'sheet_metal',
  'pcb_fabrication',
  'wire_harness',
  'casting',
  'unknown',
]);
const projectIdPattern = /^[A-Za-z0-9._~-]+$/;
const readinessStates = new Set(['pre_solver_ready', 'review_required', 'blocked_missing_inputs', 'solver_result_available']);
const readinessTrustLabels = new Set(['demo_estimate', 'pre_solver_input', 'solver_result']);
const readinessConfidenceValues = new Set(['verified_from_authoritative_source', 'verified_from_manufacturer_data', 'calculated_from_user_inputs', 'estimated_from_heuristic', 'unknown_or_needs_review']);
const readinessLoadTypes = new Set(['force', 'moment', 'pressure', 'gravity', 'thermal']);
const readinessConstraintTypes = new Set(['fixed', 'pinned', 'bearing', 'contact', 'symmetry', 'review_required']);
const taskKinds = new Set(['lift_payload', 'reach', 'cycle_time', 'fit_envelope', 'fatigue_life', 'serviceability', 'wiring_clearance', 'custom']);
const taskValidationMethods = new Set(['heuristic', 'simulation', 'test', 'review', 'unknown']);
const analysisAdaptersByJobType = {
  import_design: new Set(['freecad-worker']),
  generate_exploded_view: new Set(['freecad-worker']),
  extract_part_list: new Set(['freecad-worker']),
  estimate_mass_properties: new Set(['freecad-worker']),
  quick_load_heuristic: new Set(['local-pre-solver-runner', 'calculix-fea-worker']),
  run_fea: new Set(['local-pre-solver-runner', 'freecad-fea-prep-worker', 'gmsh-meshing-worker', 'calculix-fea-worker']),
  rerate_payload_capability: new Set(['calculix-fea-worker', 'capability-heuristic-worker']),
  check_wire_routing: new Set(['wireviz-harness-worker']),
  generate_bom: new Set(['wireviz-harness-worker', 'supplier-options-worker']),
  generate_manufacturing_report: new Set(['supplier-options-worker']),
};
const analysisJobTypes = new Set(Object.keys(analysisAdaptersByJobType));
const analysisJobStatuses = new Set(['queued', 'running', 'blocked_missing_adapter', 'completed', 'failed']);
const analysisArtifactKinds = new Set(['cad_metadata', 'exploded_view', 'part_list', 'mass_properties', 'load_heuristic', 'fea_summary', 'payload_rerating', 'wiring_check', 'bom', 'manufacturing_report']);
const reportStatuses = new Set(['draft', 'advisory', 'requires_review', 'superseded']);
const analysisArtifactKindByJobType = {
  import_design: 'cad_metadata',
  generate_exploded_view: 'exploded_view',
  extract_part_list: 'part_list',
  estimate_mass_properties: 'mass_properties',
  quick_load_heuristic: 'load_heuristic',
  run_fea: 'fea_summary',
  rerate_payload_capability: 'payload_rerating',
  check_wire_routing: 'wiring_check',
  generate_bom: 'bom',
  generate_manufacturing_report: 'manufacturing_report',
};
const legacyMockArtifactKindsByJobType = {
  import_design: new Set(['assembly_tree']),
  rerate_payload_capability: new Set(['advisory_note']),
  run_fea: new Set(['future_fea_result']),
  check_wire_routing: new Set(['wiring_review']),
};

const modificationValidationError = (modification) => {
  if (!modification || typeof modification !== 'object' || Array.isArray(modification)) {
    return 'request body must be a modification object';
  }
  const unknownFields = Object.keys(modification).filter((field) => !modificationFields.has(field));
  if (unknownFields.length > 0) return `unsupported modification fields: ${unknownFields.sort().join(', ')}`;
  for (const field of ['id', 'target_part_id', 'description']) {
    if (typeof modification[field] !== 'string') return `${field} is required and must be a string`;
  }
  if (modification.material_id != null && typeof modification.material_id !== 'string') {
    return 'material_id must be a string or null';
  }
  if (typeof modification.material_id === 'string' && !modification.material_id.trim()) {
    return 'material_id must not be blank';
  }
  if (
    modification.manufacturing_process != null
    && !manufacturingProcesses.has(modification.manufacturing_process)
  ) {
    return 'manufacturing_process is invalid';
  }
  if (Object.hasOwn(modification, 'dimension_changes')) {
    const changes = modification.dimension_changes;
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      return 'dimension_changes must be an object';
    }
    for (const [field, value] of Object.entries(changes)) {
      if (!editableDimensionFields.has(field)) return `dimension_changes contains unsupported field ${field}`;
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return `${field} must be a positive number`;
      }
    }
  }
  return null;
};

const projectManufacturingOptions = () =>
  project.assemblies.flatMap((assembly) =>
    assembly.parts.map((part) => ({
      part_id: part.id,
      part_name: part.name,
      options: part.manufacturing_options,
    })),
  );

const localSolverToolBoundaries = () => [
  {
    adapter_name: 'freecad-fea-prep-worker',
    open_source_tool: 'FreeCAD',
    role: 'Prepare source CAD into analysis geometry, named regions, materials, and normalized units.',
    binary_candidates: ['freecadcmd', 'freecad', 'FreeCAD'],
    resolved_command: null,
    availability: 'unavailable',
    review_status: 'unavailable_review_required',
    message: 'Mock backend does not invoke FreeCAD. Use the FastAPI backend to inspect local command availability.',
  },
  {
    adapter_name: 'gmsh-meshing-worker',
    open_source_tool: 'Gmsh',
    role: 'Generate finite-element mesh and mesh-quality metadata from prepared geometry.',
    binary_candidates: ['gmsh'],
    resolved_command: null,
    availability: 'unavailable',
    review_status: 'unavailable_review_required',
    message: 'Mock backend does not invoke Gmsh. Use the FastAPI backend to inspect local command availability.',
  },
  {
    adapter_name: 'calculix-fea-worker',
    open_source_tool: 'CalculiX',
    role: 'Run static structural solve and emit logs, result files, and a review report.',
    binary_candidates: ['ccx', 'calculix'],
    resolved_command: null,
    availability: 'unavailable',
    review_status: 'unavailable_review_required',
    message: 'Mock backend does not invoke CalculiX. Use the FastAPI backend to inspect local command availability.',
  },
];

const fallbackReadinessPreviews = () => project.assemblies.flatMap((assembly) => {
  const assemblyPreview = {
    project_id: project.id,
    target_id: assembly.id,
    target_name: assembly.name,
    target_kind: 'assembly',
    state: 'review_required',
    trust_label: 'pre_solver_input',
    summary: 'Mock readiness preview regenerated from imported project assembly data.',
    criteria: ['Review all parts, materials, wiring routes, and solver inputs before FEA.'],
    load_cases: [],
    constraints: [],
    solver_inputs: {
      geometry_source: null,
      units: 'mm, N, MPa',
      mesh_size_mm: null,
      freecad_document: null,
      gmsh_model: null,
      calculix_input_deck: null,
      notes: ['Mock API does not invoke FreeCAD, Gmsh, or CalculiX.'],
    },
    expected_result_artifacts: [],
    solver_pipeline: [],
    demo_estimates: [],
    review_required: ['Regenerate authoritative readiness with the FastAPI backend or a future solver worker.'],
    generated_at: new Date().toISOString(),
  };
  const partPreviews = assembly.parts.map((part) => ({
    ...assemblyPreview,
    target_id: part.id,
    target_name: part.name,
    target_kind: 'part',
    summary: 'Mock readiness preview regenerated from imported project part data.',
  }));
  return [assemblyPreview, ...partPreviews];
});

const currentReadinessPreviews = () => {
  const targetIds = project.assemblies.flatMap((assembly) => [assembly.id, ...assembly.parts.map((part) => part.id)]);
  const previewIds = new Set(analysisReadinessPreviews.map((preview) => preview.target_id));
  return targetIds.every((targetId) => previewIds.has(targetId))
    ? analysisReadinessPreviews
    : fallbackReadinessPreviews();
};

const projectPanelData = () => ({
  ...mockBackendPanelData,
  project,
  task_requirements: project.active_task ? [project.active_task] : [],
  bom_items: project.assemblies.flatMap((assembly) => assembly.parts.map((part) => ({
    id: `bom-${part.id}`,
    part_id: part.id,
    name: part.name,
    quantity: 1,
    unit: 'part',
    license_or_terms: 'Derived from local project assembly metadata',
  }))),
  analysis_readiness_previews: currentReadinessPreviews(),
  manufacturing_options: projectManufacturingOptions(),
  wiring_routes: project.assemblies.flatMap((assembly) => assembly.wiring_routes).filter((route, index, routes) => (
    routes.findIndex((candidate) => candidate.id === route.id) === index
  )),
  reports: project.reports,
});

const projectFileProject = () => {
  const exportedProject = structuredClone(project);
  exportedProject.analysis_jobs = exportedProject.analysis_jobs.map((job) => ({
    ...job,
    created_at: job.created_at ?? new Date().toISOString(),
    updated_at: job.updated_at ?? new Date().toISOString(),
    artifacts: job.artifacts.map((artifact, index) => ({
      ...artifact,
      id: artifact.id ?? `artifact-${job.id}-${index + 1}`,
      job_id: artifact.job_id ?? job.id,
      kind: artifact.kind,
      title: artifact.title,
      summary: artifact.summary ?? artifact.title,
      payload: artifact.payload ?? {},
      generated_by: artifact.generated_by ?? job.adapter_name,
      created_at: artifact.created_at ?? job.created_at ?? new Date().toISOString(),
    })),
  }));
  return exportedProject;
};

const projectFile = () => ({
  format: 'mechaflow-cad.project',
  schema_version: '1.0',
  metadata: {
    exported_at: new Date().toISOString(),
    source_api_version: mockBackendMetadata.version,
    exported_by: 'mechaflow-cad-mock-api',
    notes: [
      'MVP JSON project file from the desktop mock API.',
      'Real STEP and FreeCAD imports are future extensions.',
    ],
  },
  project: projectFileProject(),
  analysis_readiness_previews: currentReadinessPreviews(),
  extensions: {
    future_imports: {
      step: 'reserved for a future FreeCAD-backed geometry import worker',
      freecad: 'reserved for a future FreeCAD document import worker',
    },
  },
});

const normalizeProjectFileDefaults = (file) => {
  const withDefault = (value, fallback) => value === undefined ? fallback : value;
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const mapObjects = (value, mapper, fallback = []) => {
    const collection = withDefault(value, fallback);
    return Array.isArray(collection)
      ? collection.map((item) => isObject(item) ? mapper(item) : item)
      : collection;
  };
  const now = new Date().toISOString();
  return {
    ...file,
    metadata: withDefault(file.metadata, {}),
    extensions: withDefault(file.extensions, {}),
    project: {
      ...file.project,
      assemblies: mapObjects(file.project.assemblies, (assembly) => ({
        ...assembly,
        nodes: mapObjects(assembly.nodes, (node) => ({
          ...node,
          part_ids: withDefault(node.part_ids, []),
          child_assembly_ids: withDefault(node.child_assembly_ids, []),
          exploded_transform: withDefault(node.exploded_transform, {}),
        })),
        parts: mapObjects(assembly.parts, (part) => ({
          ...part,
          dimensions: withDefault(part.dimensions, {}),
          manufacturing_options: withDefault(part.manufacturing_options, []),
          related_fasteners: withDefault(part.related_fasteners, []),
          wiring_route_ids: withDefault(part.wiring_route_ids, []),
          metadata: withDefault(part.metadata, {}),
        })),
        wiring_routes: mapObjects(assembly.wiring_routes, (route) => ({
          ...route,
          path_points_mm: withDefault(route.path_points_mm, []),
          harness_bom: withDefault(route.harness_bom, []),
          risk_notes: withDefault(route.risk_notes, []),
          confidence: withDefault(route.confidence, 'unknown_or_needs_review'),
        })),
      })),
      materials: mapObjects(file.project.materials, (material) => ({
        ...material,
        properties: withDefault(material.properties, {}),
        compatible_processes: withDefault(material.compatible_processes, []),
        notes: withDefault(material.notes, []),
      })),
      modifications: mapObjects(file.project.modifications, (modification) => ({
        ...modification,
        dimension_changes: withDefault(modification.dimension_changes, {}),
        created_at: withDefault(modification.created_at, now),
      })),
      analysis_jobs: mapObjects(file.project.analysis_jobs, (job) => ({
        ...job,
        local_compute_preferred: withDefault(job.local_compute_preferred, true),
        input_summary: withDefault(job.input_summary, {}),
        result_summary: withDefault(job.result_summary, {}),
        artifacts: mapObjects(job.artifacts, (artifact) => ({
          ...artifact,
          payload: withDefault(artifact.payload, {}),
          created_at: withDefault(artifact.created_at, now),
        })),
        created_at: withDefault(job.created_at, now),
        updated_at: withDefault(job.updated_at, now),
      })),
      reports: mapObjects(file.project.reports, (report) => ({
        ...report,
        status: withDefault(report.status, 'advisory'),
        task_results: withDefault(report.task_results, []),
        manufacturing_impacts: withDefault(report.manufacturing_impacts, []),
        wiring_impacts: withDefault(report.wiring_impacts, []),
        risks: withDefault(report.risks, []),
        unknowns: withDefault(report.unknowns, []),
        recommendations: withDefault(report.recommendations, []),
        assumptions: withDefault(report.assumptions, []),
        generated_at: withDefault(report.generated_at, now),
      })),
    },
    analysis_readiness_previews: mapObjects(file.analysis_readiness_previews, (preview) => ({
      ...preview,
      criteria: withDefault(preview.criteria, []),
      load_cases: withDefault(preview.load_cases, []),
      constraints: withDefault(preview.constraints, []),
      solver_inputs: preview.solver_inputs === undefined ? { notes: [] } : {
        ...preview.solver_inputs,
        notes: isObject(preview.solver_inputs) ? withDefault(preview.solver_inputs.notes, []) : preview.solver_inputs,
      },
      material_properties: isObject(preview.material_properties)
        ? {
          ...preview.material_properties,
          properties: withDefault(preview.material_properties.properties, {}),
        }
        : preview.material_properties,
      expected_result_artifacts: withDefault(preview.expected_result_artifacts, []),
      solver_pipeline: withDefault(preview.solver_pipeline, []),
      demo_estimates: withDefault(preview.demo_estimates, []),
      review_required: withDefault(preview.review_required, []),
      generated_at: withDefault(preview.generated_at, now),
    })),
  };
};

const projectFileValidationError = (file) => {
  let error;
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const requireObject = (value, path) => isObject(value) ? null : `${path} must be an object`;
  const requireArray = (value, path) => Array.isArray(value) ? null : `${path} must be an array`;
  const requireString = (value, path) => typeof value === 'string' && value.trim() ? null : `${path} is required and must be a non-blank string`;
  const requireFiniteNumber = (value, path, minimum = 0) => typeof value === 'number' && Number.isFinite(value) && value >= minimum ? null : `${path} must be a finite number greater than or equal to ${minimum}`;
  const requireFiniteScalar = (value, path) => typeof value === 'number' && Number.isFinite(value) ? null : `${path} must be a finite number`;
  const requireStringArray = (value, path) => {
    const error = requireArray(value, path);
    if (error) return error;
    for (const [index, item] of value.entries()) {
      const itemError = requireString(item, `${path}[${index}]`);
      if (itemError) return itemError;
    }
    return null;
  };
  const requireDateString = (value, path) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? null : `${path} must be a valid datetime string`;
  const validateSource = (value, path) => {
    if (value == null) return null;
    let error = rejectUnknownFields(value, ['label', 'url', 'retrieved_at', 'license'], path);
    if (error) return error;
    error = requiredFields(value, ['label'], path) || requireString(value.label, `${path}.label`);
    if (error) return error;
    if (value.url != null) {
      try {
        const url = new URL(value.url);
        if (!['http:', 'https:'].includes(url.protocol)) return `${path}.url must be an HTTP URL`;
      } catch {
        return `${path}.url must be a valid URL`;
      }
    }
    if (value.retrieved_at != null) {
      error = requireDateString(value.retrieved_at, `${path}.retrieved_at`);
      if (error) return error;
    }
    if (value.license != null) return requireString(value.license, `${path}.license`);
    return null;
  };
  const uniqueIds = (items, path) => {
    const seen = new Set();
    for (const [index, item] of items.entries()) {
      const error = requireString(item?.id, `${path}[${index}].id`);
      if (error) return error;
      if (seen.has(item.id)) return `${path} ids must be unique: ${item.id}`;
      seen.add(item.id);
    }
    return null;
  };
  const requiredFields = (value, fields, path) => {
    const objectError = requireObject(value, path);
    if (objectError) return objectError;
    for (const field of fields) {
      if (!Object.hasOwn(value, field)) return `${path}.${field} is required`;
    }
    return null;
  };
  const rejectUnknownFields = (value, fields, path) => {
    if (!isObject(value)) return `${path} must be an object`;
    const unknownFields = Object.keys(value).filter((field) => !fields.includes(field));
    return unknownFields.length > 0 ? `${path} contains unsupported fields: ${unknownFields.sort().join(', ')}` : null;
  };
  const validateProject = (candidate) => {
    let error = requiredFields(candidate, ['id', 'name', 'assemblies', 'materials', 'modifications', 'analysis_jobs', 'reports'], 'project');
    if (error) return error;
    error = rejectUnknownFields(candidate, ['id', 'name', 'description', 'reference_design_id', 'active_task', 'assemblies', 'materials', 'modifications', 'analysis_jobs', 'reports', 'created_at', 'updated_at'], 'project');
    if (error) return error;
    error = requireString(candidate.id, 'project.id') || requireString(candidate.name, 'project.name');
    if (error) return error;
    if (candidate.id === 'sample' || candidate.id === '.' || candidate.id === '..' || !projectIdPattern.test(candidate.id)) return 'project.id must be a URL-safe path segment';
    for (const field of ['description', 'reference_design_id']) {
      if (candidate[field] != null) {
        error = requireString(candidate[field], `project.${field}`);
        if (error) return error;
      }
    }
    for (const field of ['created_at', 'updated_at']) {
      if (candidate[field] != null) {
        error = requireDateString(candidate[field], `project.${field}`);
        if (error) return error;
      }
    }
    if (candidate.active_task != null) {
      error = rejectUnknownFields(candidate.active_task, ['id', 'kind', 'description', 'target_value', 'unit', 'safety_factor_min', 'validation_method', 'assumptions'], 'project.active_task');
      if (error) return error;
      error = requiredFields(candidate.active_task, ['id', 'kind', 'description'], 'project.active_task');
      if (error) return error;
      for (const field of ['id', 'kind', 'description']) {
        error = requireString(candidate.active_task[field], `project.active_task.${field}`);
        if (error) return error;
      }
      if (!taskKinds.has(candidate.active_task.kind)) return 'project.active_task.kind is invalid';
      if (candidate.active_task.validation_method != null && !taskValidationMethods.has(candidate.active_task.validation_method)) return 'project.active_task.validation_method is invalid';
      for (const field of ['unit', 'validation_method']) {
        if (candidate.active_task[field] != null) {
          error = requireString(candidate.active_task[field], `project.active_task.${field}`);
          if (error) return error;
        }
      }
      if (candidate.active_task.target_value != null) {
        error = requireFiniteNumber(candidate.active_task.target_value, 'project.active_task.target_value');
        if (error) return error;
      }
      if (candidate.active_task.safety_factor_min != null) {
        error = requireFiniteNumber(candidate.active_task.safety_factor_min, 'project.active_task.safety_factor_min', Number.MIN_VALUE);
        if (error) return error;
      }
      if (candidate.active_task.assumptions != null) {
        error = requireStringArray(candidate.active_task.assumptions, 'project.active_task.assumptions');
        if (error) return error;
      }
    }
    for (const field of ['assemblies', 'materials', 'modifications', 'analysis_jobs', 'reports']) {
      error = requireArray(candidate[field], `project.${field}`);
      if (error) return error;
    }
    error = uniqueIds(candidate.assemblies, 'project.assemblies');
    if (error) return error;
    error = uniqueIds(candidate.materials, 'project.materials');
    if (error) return error;
    const assemblyIds = new Set(candidate.assemblies.map((assembly) => assembly?.id));
    const partIds = new Set(
      candidate.assemblies.flatMap((assembly) => (Array.isArray(assembly?.parts) ? assembly.parts.map((part) => part?.id) : [])),
    );
    if (partIds.size !== candidate.assemblies.flatMap((assembly) => (Array.isArray(assembly?.parts) ? assembly.parts.map((part) => part?.id) : [])).length) return 'part ids must be unique across project assemblies';
    const routeIds = new Set();
    for (const [assemblyIndex, assembly] of candidate.assemblies.entries()) {
      const assemblyPath = `project.assemblies[${assemblyIndex}]`;
      error = requiredFields(assembly, ['id', 'name', 'root_node_id', 'nodes', 'parts', 'wiring_routes'], assemblyPath);
      if (error) return error;
      error = rejectUnknownFields(assembly, ['id', 'name', 'root_node_id', 'nodes', 'parts', 'wiring_routes', 'assembly_structure_confidence'], assemblyPath);
      if (error) return error;
      if (assembly.assembly_structure_confidence != null && !readinessConfidenceValues.has(assembly.assembly_structure_confidence)) return `${assemblyPath}.assembly_structure_confidence is invalid`;
      error = requireString(assembly.name, `${assemblyPath}.name`) || requireString(assembly.root_node_id, `${assemblyPath}.root_node_id`);
      if (error) return error;
      for (const field of ['nodes', 'parts', 'wiring_routes']) {
        error = requireArray(assembly[field], `${assemblyPath}.${field}`);
        if (error) return error;
      }
      const nodeIds = new Set(assembly.nodes.map((node) => node?.id));
      for (const [nodeIndex, node] of assembly.nodes.entries()) {
        const nodePath = `${assemblyPath}.nodes[${nodeIndex}]`;
        error = requiredFields(node, ['id', 'name', 'part_ids', 'child_assembly_ids', 'exploded_transform'], nodePath);
        if (error) return error;
        error = rejectUnknownFields(node, ['id', 'name', 'assembly_id', 'part_id', 'part_ids', 'child_assembly_ids', 'exploded_transform'], nodePath);
        if (error) return error;
        if (assembly.nodes.findIndex((candidate) => candidate?.id === node.id) !== nodeIndex) return `${assemblyPath}.nodes ids must be unique: ${node.id}`;
        error = requireString(node.name, `${nodePath}.name`);
        if (error) return error;
        for (const field of ['assembly_id', 'part_id']) {
          if (node[field] != null) {
            error = requireString(node[field], `${nodePath}.${field}`);
            if (error) return error;
          }
        }
        if (node.assembly_id != null && node.assembly_id !== assembly.id) return `${nodePath}.assembly_id must match the containing assembly`;
        if (node.part_id != null && !partIds.has(node.part_id)) return `${nodePath}.part_id references an unknown part`;
        for (const field of ['part_ids', 'child_assembly_ids']) {
          error = requireStringArray(node[field], `${nodePath}.${field}`);
          if (error) return error;
        }
        error = requireObject(node.exploded_transform, `${nodePath}.exploded_transform`);
        if (error) return error;
        for (const partId of node.part_ids) if (!partIds.has(partId)) return `assembly node ${node.id} references unknown part ${partId}`;
        for (const childAssemblyId of node.child_assembly_ids) {
          if (!assemblyIds.has(childAssemblyId)) return `assembly node ${node.id} references unknown child assembly ${childAssemblyId}`;
        }
      }
      if (!nodeIds.has(assembly.root_node_id)) return `assembly ${assembly.id} references unknown root node ${assembly.root_node_id}`;
      error = uniqueIds(assembly.parts, `${assemblyPath}.parts`);
      if (error) return error;
      for (const part of assembly.parts) {
        if (assemblyIds.has(part?.id)) return `part id overlaps another project target: ${part?.id}`;
        error = rejectUnknownFields(part, ['id', 'name', 'category', 'purpose', 'material_id', 'dimensions', 'mass_kg', 'manufacturing_options', 'related_fasteners', 'wiring_route_ids', 'source_file', 'metadata'], `${assemblyPath}.parts`);
        if (error) return error;
        error = requiredFields(part, ['id', 'name', 'category', 'dimensions', 'manufacturing_options', 'related_fasteners', 'wiring_route_ids', 'metadata'], `${assemblyPath}.parts`);
        if (error) return error;
        error = requireString(part.name, `${assemblyPath}.parts.name`) || requireString(part.category, `${assemblyPath}.parts.category`);
        if (error) return error;
        for (const field of ['purpose', 'source_file']) {
          if (part[field] != null) {
            error = requireString(part[field], `${assemblyPath}.parts.${field}`);
            if (error) return error;
          }
        }
        for (const field of ['dimensions', 'metadata']) {
          error = requireObject(part[field], `${assemblyPath}.parts.${field}`);
          if (error) return error;
        }
        error = rejectUnknownFields(part.dimensions, ['length_mm', 'width_mm', 'height_mm', 'thickness_mm', 'metadata'], `${assemblyPath}.parts.dimensions`);
        if (error) return error;
        error = requireStringArray(part.related_fasteners, `${assemblyPath}.parts.related_fasteners`) || requireStringArray(part.wiring_route_ids, `${assemblyPath}.parts.wiring_route_ids`);
        if (error) return error;
        for (const field of ['length_mm', 'width_mm', 'height_mm', 'thickness_mm']) {
          if (part.dimensions[field] != null) {
            error = requireFiniteNumber(part.dimensions[field], `${assemblyPath}.parts.dimensions.${field}`, Number.MIN_VALUE);
            if (error) return error;
          }
        }
        if (part.mass_kg != null) {
          error = requireFiniteNumber(part.mass_kg, `${assemblyPath}.parts.mass_kg`);
          if (error) return error;
        }
        for (const field of ['manufacturing_options', 'related_fasteners', 'wiring_route_ids']) {
          error = requireArray(part[field], `${assemblyPath}.parts.${field}`);
          if (error) return error;
        }
        for (const [optionIndex, option] of part.manufacturing_options.entries()) {
          const optionPath = `${assemblyPath}.parts.manufacturing_options[${optionIndex}]`;
          error = rejectUnknownFields(option, ['id', 'process', 'description', 'cost', 'lead_time_days_min', 'lead_time_days_max', 'supplier_url', 'risk_notes', 'confidence'], optionPath);
          if (error) return error;
          error = requiredFields(option, ['id', 'process', 'description', 'risk_notes'], optionPath);
          if (error) return error;
          error = requireString(option.process, `${optionPath}.process`) || requireString(option.description, `${optionPath}.description`);
          if (error) return error;
          if (!manufacturingProcesses.has(option.process)) return `${optionPath}.process is invalid`;
          if (option.confidence != null && !readinessConfidenceValues.has(option.confidence)) return `${optionPath}.confidence is invalid`;
          if (option.lead_time_days_min != null) {
            error = requireFiniteNumber(option.lead_time_days_min, `${optionPath}.lead_time_days_min`);
            if (error) return error;
          }
          if (option.lead_time_days_max != null) {
            error = requireFiniteNumber(option.lead_time_days_max, `${optionPath}.lead_time_days_max`);
            if (error) return error;
          }
        }
      }
      error = uniqueIds(assembly.wiring_routes, `${assemblyPath}.wiring_routes`);
      if (error) return error;
      for (const route of assembly.wiring_routes) {
        if (routeIds.has(route?.id)) return `wiring route ids must be unique: ${route?.id}`;
        routeIds.add(route?.id);
        error = rejectUnknownFields(route, ['id', 'name', 'from_connector', 'to_connector', 'path_points_mm', 'bend_radius_min_mm', 'clearance_min_mm', 'harness_bom', 'risk_notes', 'confidence'], `${assemblyPath}.wiring_routes`);
        if (error) return error;
        error = requiredFields(route, ['id', 'name', 'from_connector', 'to_connector', 'path_points_mm', 'harness_bom', 'risk_notes'], `${assemblyPath}.wiring_routes`);
        if (error) return error;
        error = requireString(route.name, `${assemblyPath}.wiring_routes.name`);
        if (error) return error;
        error = requireArray(route.path_points_mm, `${assemblyPath}.wiring_routes.path_points_mm`);
        if (error) return error;
        error = requireArray(route.harness_bom, `${assemblyPath}.wiring_routes.harness_bom`) || requireArray(route.risk_notes, `${assemblyPath}.wiring_routes.risk_notes`);
        if (error) return error;
        error = requireString(route.confidence, `${assemblyPath}.wiring_routes.confidence`);
        if (error) return error;
        if (!readinessConfidenceValues.has(route.confidence)) return `${assemblyPath}.wiring_routes.confidence is invalid`;
        for (const [pointIndex, point] of route.path_points_mm.entries()) {
          error = rejectUnknownFields(point, ['x', 'y', 'z'], `${assemblyPath}.wiring_routes.path_points_mm[${pointIndex}]`);
          if (error) return error;
          error = requiredFields(point, ['x', 'y', 'z'], `${assemblyPath}.wiring_routes.path_points_mm[${pointIndex}]`);
          if (error) return error;
          for (const axis of ['x', 'y', 'z']) {
            if (typeof point[axis] !== 'number' || !Number.isFinite(point[axis])) {
              return `${assemblyPath}.wiring_routes.path_points_mm[${pointIndex}].${axis} must be a finite number`;
            }
          }
        }
        for (const field of ['bend_radius_min_mm', 'clearance_min_mm']) {
          if (route[field] != null) {
            error = requireFiniteNumber(route[field], `${assemblyPath}.wiring_routes.${field}`);
            if (error) return error;
          }
        }
        for (const connectorField of ['from_connector', 'to_connector']) {
          error = rejectUnknownFields(route[connectorField], ['id', 'name', 'pin_count', 'part_id'], `${assemblyPath}.wiring_routes.${connectorField}`);
          if (error) return error;
          error = requiredFields(route[connectorField], ['id', 'name'], `${assemblyPath}.wiring_routes.${connectorField}`);
          if (error) return error;
          error = requireString(route[connectorField].id, `${assemblyPath}.wiring_routes.${connectorField}.id`);
          if (error) return error;
          error = requireString(route[connectorField].name, `${assemblyPath}.wiring_routes.${connectorField}.name`);
          if (error) return error;
          if (route[connectorField].pin_count != null && (!Number.isInteger(route[connectorField].pin_count) || route[connectorField].pin_count < 0)) {
            return `${assemblyPath}.wiring_routes.${connectorField}.pin_count must be a non-negative integer`;
          }
          if (route[connectorField].part_id != null) {
            error = requireString(route[connectorField].part_id, `${assemblyPath}.wiring_routes.${connectorField}.part_id`);
            if (error) return error;
          }
          if (route[connectorField].part_id != null && !partIds.has(route[connectorField].part_id)) {
            return `wiring route ${route.id} references unknown part ${route[connectorField].part_id}`;
          }
        }
      }
    }
    const materialIds = new Set(candidate.materials.map((material) => material?.id));
    for (const material of candidate.materials) {
      error = rejectUnknownFields(material, ['id', 'name', 'family', 'properties', 'compatible_processes', 'cost', 'source', 'confidence', 'notes'], 'project.materials');
      if (error) return error;
      error = requiredFields(material, ['id', 'name', 'family', 'properties', 'compatible_processes', 'notes'], 'project.materials');
      if (error) return error;
      error = requireString(material.name, `project.materials.${material.id}.name`) || requireString(material.family, `project.materials.${material.id}.family`);
      if (error) return error;
      error = requireObject(material.properties, 'project.materials.properties') || requireArray(material.compatible_processes, 'project.materials.compatible_processes') || requireArray(material.notes, 'project.materials.notes');
      if (error) return error;
      error = rejectUnknownFields(material.properties, ['density_kg_m3', 'elastic_modulus_gpa', 'yield_strength_mpa', 'ultimate_strength_mpa', 'poisson_ratio', 'thermal_conductivity_w_mk', 'heat_deflection_temp_c', 'max_service_temp_c'], 'project.materials.properties');
      if (error) return error;
      for (const field of ['density_kg_m3', 'elastic_modulus_gpa', 'yield_strength_mpa', 'ultimate_strength_mpa', 'thermal_conductivity_w_mk', 'heat_deflection_temp_c', 'max_service_temp_c']) {
        if (material.properties[field] != null) {
          error = requireFiniteNumber(material.properties[field], `project.materials.properties.${field}`, 0);
          if (error) return error;
        }
      }
      if (material.properties.poisson_ratio != null) {
        error = typeof material.properties.poisson_ratio === 'number' && Number.isFinite(material.properties.poisson_ratio) && material.properties.poisson_ratio >= 0 && material.properties.poisson_ratio < 0.5 ? null : 'project.materials.properties.poisson_ratio is invalid';
        if (error) return error;
      }
      if (material.confidence != null && !readinessConfidenceValues.has(material.confidence)) return `project.materials.${material.id}.confidence is invalid`;
      error = validateSource(material.source, `project.materials.${material.id}.source`);
      if (error) return error;
      for (const process of material.compatible_processes) if (!manufacturingProcesses.has(process)) return `material ${material.id} has an invalid compatible process`;
    }
    for (const assembly of candidate.assemblies) {
      for (const part of assembly.parts) {
        if (part.material_id != null && !materialIds.has(part.material_id)) return `part ${part.id} references unknown project material ${part.material_id}`;
      }
    }
    for (const [modificationIndex, modification] of candidate.modifications.entries()) {
      const modificationPath = `project.modifications[${modificationIndex}]`;
      error = rejectUnknownFields(modification, ['id', 'target_part_id', 'description', 'material_id', 'dimension_changes', 'manufacturing_process', 'created_at'], modificationPath);
      if (error) return error;
      error = requiredFields(modification, ['id', 'target_part_id', 'description', 'dimension_changes'], modificationPath);
      if (error) return error;
      for (const field of ['id', 'target_part_id', 'description']) {
        error = requireString(modification[field], `${modificationPath}.${field}`);
        if (error) return error;
      }
      error = requireObject(modification.dimension_changes, `${modificationPath}.dimension_changes`);
      if (error) return error;
      for (const [field, value] of Object.entries(modification.dimension_changes)) {
        if (!['length_mm', 'width_mm', 'height_mm', 'thickness_mm'].includes(field)) return `${modificationPath}.dimension_changes contains unsupported field ${field}`;
        error = requireFiniteNumber(value, `${modificationPath}.dimension_changes.${field}`, Number.MIN_VALUE);
        if (error) return error;
      }
    }
    error = uniqueIds(candidate.analysis_jobs, 'project.analysis_jobs');
    if (error) return error;
    for (const job of candidate.analysis_jobs) {
      error = rejectUnknownFields(job, ['id', 'job_type', 'status', 'target_id', 'project_id', 'adapter_name', 'local_compute_preferred', 'input_summary', 'result_summary', 'artifacts', 'created_at', 'updated_at'], 'project.analysis_jobs');
      if (error) return error;
      error = requiredFields(job, ['id', 'job_type', 'status', 'target_id', 'project_id', 'adapter_name', 'input_summary', 'result_summary', 'artifacts'], 'project.analysis_jobs');
      if (error) return error;
      if (job.project_id !== candidate.id) return `analysis job ${job.id} belongs to another project`;
      for (const field of ['job_type', 'status', 'target_id', 'project_id', 'adapter_name']) {
        error = requireString(job[field], `analysis job ${job.id}.${field}`);
        if (error) return error;
      }
      if (!analysisJobTypes.has(job.job_type)) return `analysis job ${job.id}.job_type is invalid`;
      if (!analysisJobStatuses.has(job.status)) return `analysis job ${job.id}.status is invalid`;
      if (typeof job.local_compute_preferred !== 'boolean') return `analysis job ${job.id}.local_compute_preferred must be a boolean`;
      error = requireObject(job.input_summary, `analysis job ${job.id}.input_summary`) || requireObject(job.result_summary, `analysis job ${job.id}.result_summary`);
      if (error) return error;
      for (const field of ['created_at', 'updated_at']) {
        if (Object.hasOwn(job, field)) {
          error = requireDateString(job[field], `analysis job ${job.id}.${field}`);
          if (error) return error;
        }
      }
      if (!analysisAdaptersByJobType[job.job_type]?.has(job.adapter_name)) return `adapter ${job.adapter_name} does not support analysis job type ${job.job_type}`;
      error = requireArray(job.artifacts, `analysis job ${job.id}.artifacts`);
      if (error) return error;
      for (const artifact of job.artifacts) {
        error = rejectUnknownFields(artifact, ['id', 'job_id', 'kind', 'title', 'summary', 'payload', 'confidence', 'generated_by', 'created_at'], `analysis job ${job.id}.artifacts`);
        if (error) return error;
        error = requiredFields(artifact, ['id', 'job_id', 'kind', 'title', 'summary', 'payload', 'generated_by', 'created_at'], `analysis job ${job.id}.artifacts`);
        if (error) return error;
        if (artifact.job_id !== job.id) return `analysis artifact ${artifact.id} belongs to another job`;
        error = requireString(artifact.id, `analysis artifact ${artifact.id}.id`) || requireString(artifact.job_id, `analysis artifact ${artifact.id}.job_id`) || requireString(artifact.title, `analysis artifact ${artifact.id}.title`) || requireString(artifact.summary, `analysis artifact ${artifact.id}.summary`) || requireString(artifact.generated_by, `analysis artifact ${artifact.id}.generated_by`) || requireObject(artifact.payload, `analysis artifact ${artifact.id}.payload`) || requireDateString(artifact.created_at, `analysis artifact ${artifact.id}.created_at`);
        if (error) return error;
        if (!analysisArtifactKinds.has(artifact.kind) && !Object.values(legacyMockArtifactKindsByJobType).some((kinds) => kinds.has(artifact.kind))) return `analysis artifact ${artifact.id}.kind is invalid`;
        if (artifact.confidence != null && !readinessConfidenceValues.has(artifact.confidence)) return `analysis artifact ${artifact.id}.confidence is invalid`;
        if (artifact.created_at != null) {
          error = requireDateString(artifact.created_at, `analysis artifact ${artifact.id}.created_at`);
          if (error) return error;
        }
        if (artifact.kind !== analysisArtifactKindByJobType[job.job_type] && !legacyMockArtifactKindsByJobType[job.job_type]?.has(artifact.kind)) return `analysis job type ${job.job_type} requires a compatible artifact kind`;
      }
    }
    error = uniqueIds(candidate.reports, 'project.reports');
    if (error) return error;
    for (const report of candidate.reports) {
      error = rejectUnknownFields(report, ['id', 'project_id', 'title', 'status', 'summary', 'task_results', 'weight_delta_kg', 'cost_delta', 'manufacturing_impacts', 'wiring_impacts', 'risks', 'unknowns', 'recommendations', 'assumptions', 'generated_at'], 'project.reports');
      if (error) return error;
      error = requiredFields(report, ['id', 'project_id', 'title', 'summary', 'task_results', 'manufacturing_impacts', 'wiring_impacts', 'risks', 'unknowns', 'recommendations', 'assumptions', 'generated_at'], 'project.reports');
      if (error) return error;
      if (report.project_id !== candidate.id) return `report ${report.id} belongs to another project`;
      if (report.status != null && !reportStatuses.has(report.status)) return `report ${report.id}.status is invalid`;
      for (const field of ['task_results', 'manufacturing_impacts', 'wiring_impacts', 'risks', 'unknowns', 'recommendations', 'assumptions']) {
        error = requireArray(report[field], `report ${report.id}.${field}`);
        if (error) return error;
      }
    }
    return null;
  };
  if (!file || typeof file !== 'object' || Array.isArray(file)) return 'project file must be a JSON object';
  const envelopeError = rejectUnknownFields(file, ['format', 'schema_version', 'metadata', 'project', 'analysis_readiness_previews', 'extensions'], 'project file');
  if (envelopeError) return envelopeError;
  const metadataError = rejectUnknownFields(file.metadata, ['exported_at', 'source_api_version', 'exported_by', 'notes'], 'project file.metadata');
  if (metadataError) return metadataError;
  let metadataFieldError;
  for (const field of ['source_api_version', 'exported_by']) if (file.metadata[field] != null) {
    metadataFieldError = requireString(file.metadata[field], `project file.metadata.${field}`);
    if (metadataFieldError) return metadataFieldError;
  }
  if (file.metadata.notes != null) metadataFieldError = requireStringArray(file.metadata.notes, 'project file.metadata.notes');
  if (metadataFieldError) return metadataFieldError;
  if (file.metadata.exported_at != null) metadataFieldError = requireDateString(file.metadata.exported_at, 'project file.metadata.exported_at');
  if (metadataFieldError) return metadataFieldError;
  const extensionsError = requireObject(file.extensions, 'project file.extensions');
  if (extensionsError) return extensionsError;
  if (file.format != null && file.format !== 'mechaflow-cad.project') return 'unsupported project file format';
  if (file.schema_version != null && file.schema_version !== '1.0') return 'unsupported MechaFlow project file schema_version';
  if (!file.project || typeof file.project !== 'object' || Array.isArray(file.project)) return 'project is required';
  const projectError = validateProject(file.project);
  if (projectError) return projectError;
  if (file.analysis_readiness_previews != null) {
    if (!Array.isArray(file.analysis_readiness_previews)) return 'analysis_readiness_previews must be an array';
    const targets = new Map(file.project.assemblies.flatMap((assembly) => [
      [assembly.id, { kind: 'assembly', name: assembly.name }],
      ...assembly.parts.map((part) => [part.id, { kind: 'part', name: part.name }]),
    ]));
    const targetIds = file.project.assemblies.flatMap((assembly) => [assembly.id, ...assembly.parts.map((part) => part.id)]);
    if (targetIds.length !== new Set(targetIds).size) return 'readiness target ids must be unique across assemblies and parts';
    if (file.analysis_readiness_previews.length > 0 && new Set(file.analysis_readiness_previews.map((preview) => preview?.target_id)).size !== new Set(targetIds).size) return 'analysis_readiness_previews must cover every project target';
    const partIds = new Set(file.project.assemblies.flatMap((assembly) => assembly.parts.map((part) => part.id)));
    const previewTargetIds = new Set();
    for (const [index, preview] of file.analysis_readiness_previews.entries()) {
      const previewPath = `analysis_readiness_previews[${index}]`;
      const previewUnknownError = rejectUnknownFields(preview, ['project_id', 'target_id', 'target_name', 'target_kind', 'state', 'trust_label', 'summary', 'criteria', 'load_cases', 'constraints', 'material_properties', 'thermal_guidance', 'solver_inputs', 'expected_result_artifacts', 'solver_pipeline', 'demo_estimates', 'review_required', 'recommended_job_request', 'generated_at'], previewPath);
      if (previewUnknownError) return previewUnknownError;
      const previewError = requiredFields(preview, ['project_id', 'target_id', 'target_name', 'target_kind', 'state', 'trust_label', 'summary', 'criteria', 'load_cases', 'constraints', 'solver_inputs', 'expected_result_artifacts', 'solver_pipeline', 'demo_estimates', 'review_required', 'generated_at'], previewPath);
      if (previewError) return previewError;
      for (const field of ['project_id', 'target_id', 'target_name', 'target_kind', 'state', 'trust_label', 'summary', 'generated_at']) {
        const scalarError = requireString(preview[field], `${previewPath}.${field}`);
        if (scalarError) return scalarError;
      }
      if (!readinessStates.has(preview.state)) return `${previewPath}.state is invalid`;
      if (!readinessTrustLabels.has(preview.trust_label)) return `${previewPath}.trust_label is invalid`;
      if (!['part', 'assembly'].includes(preview.target_kind)) return `${previewPath}.target_kind is invalid`;
      for (const field of ['criteria', 'load_cases', 'constraints', 'expected_result_artifacts', 'solver_pipeline', 'demo_estimates', 'review_required']) {
        const arrayError = requireArray(preview[field], `${previewPath}.${field}`);
        if (arrayError) return arrayError;
      }
      const solverInputsError = requireObject(preview.solver_inputs, `${previewPath}.solver_inputs`);
      if (solverInputsError) return solverInputsError;
      error = rejectUnknownFields(preview.solver_inputs, ['geometry_source', 'units', 'mesh_size_mm', 'freecad_document', 'gmsh_model', 'calculix_input_deck', 'notes'], `${previewPath}.solver_inputs`);
      if (error) return error;
      if (preview.material_properties != null) {
        error = requireObject(preview.material_properties, `${previewPath}.material_properties`) || rejectUnknownFields(preview.material_properties, ['material_id', 'material_name', 'properties', 'provenance', 'source', 'review_notes'], `${previewPath}.material_properties`);
        if (error) return error;
        if (preview.material_properties.material_name != null) {
        error = requireString(preview.material_properties.material_name, `${previewPath}.material_properties.material_name`);
          if (error) return error;
        }
        if (preview.material_properties.properties != null) {
          error = requireObject(preview.material_properties.properties, `${previewPath}.material_properties.properties`);
          if (error) return error;
        }
        if (preview.material_properties.provenance != null) {
          error = requireString(preview.material_properties.provenance, `${previewPath}.material_properties.provenance`);
          if (error) return error;
        }
        if (preview.material_properties.review_notes != null) {
          error = requireStringArray(preview.material_properties.review_notes, `${previewPath}.material_properties.review_notes`);
          if (error) return error;
        }
        error = validateSource(preview.material_properties.source, `${previewPath}.material_properties.source`);
        if (error) return error;
        if (preview.material_properties.material_id != null) {
          error = requireString(preview.material_properties.material_id, `${previewPath}.material_properties.material_id`);
          if (error) return error;
        }
        if (preview.material_properties.provenance != null && !readinessConfidenceValues.has(preview.material_properties.provenance)) return `${previewPath}.material_properties.provenance is invalid`;
        error = rejectUnknownFields(preview.material_properties.properties, ['density_kg_m3', 'elastic_modulus_gpa', 'yield_strength_mpa', 'ultimate_strength_mpa', 'poisson_ratio', 'thermal_conductivity_w_mk', 'heat_deflection_temp_c', 'max_service_temp_c'], `${previewPath}.material_properties.properties`);
        if (error) return error;
        for (const field of ['density_kg_m3', 'elastic_modulus_gpa', 'yield_strength_mpa', 'ultimate_strength_mpa', 'thermal_conductivity_w_mk', 'heat_deflection_temp_c', 'max_service_temp_c']) {
          if (preview.material_properties.properties[field] != null) {
            error = requireFiniteNumber(preview.material_properties.properties[field], `${previewPath}.material_properties.properties.${field}`, Number.MIN_VALUE);
            if (error) return error;
          }
        }
        if (preview.material_properties.properties.poisson_ratio != null && (typeof preview.material_properties.properties.poisson_ratio !== 'number' || !Number.isFinite(preview.material_properties.properties.poisson_ratio) || preview.material_properties.properties.poisson_ratio < 0 || preview.material_properties.properties.poisson_ratio >= 0.5)) return `${previewPath}.material_properties.properties.poisson_ratio is invalid`;
      }
      if (preview.thermal_guidance != null) {
        error = requireObject(preview.thermal_guidance, `${previewPath}.thermal_guidance`) || rejectUnknownFields(preview.thermal_guidance, ['max_service_temp_c', 'heat_deflection_temp_c', 'guidance', 'confidence', 'review_required'], `${previewPath}.thermal_guidance`);
        if (error) return error;
        error = requireString(preview.thermal_guidance.guidance, `${previewPath}.thermal_guidance.guidance`);
        if (error) return error;
        if (preview.thermal_guidance.confidence != null) {
          error = requireString(preview.thermal_guidance.confidence, `${previewPath}.thermal_guidance.confidence`);
          if (error) return error;
          if (!readinessConfidenceValues.has(preview.thermal_guidance.confidence)) return `${previewPath}.thermal_guidance.confidence is invalid`;
        }
        if (preview.thermal_guidance.review_required != null && typeof preview.thermal_guidance.review_required !== 'boolean') return `${previewPath}.thermal_guidance.review_required must be a boolean`;
        for (const field of ['max_service_temp_c', 'heat_deflection_temp_c']) if (preview.thermal_guidance[field] != null) {
          error = requireFiniteNumber(preview.thermal_guidance[field], `${previewPath}.thermal_guidance.${field}`, Number.MIN_VALUE);
          if (error) return error;
        }
      }
      if (preview.recommended_job_request != null) {
        const requestPath = `${previewPath}.recommended_job_request`;
        error = requiredFields(preview.recommended_job_request, ['job_type', 'target_id', 'project_id'], requestPath) || rejectUnknownFields(preview.recommended_job_request, ['job_type', 'target_id', 'project_id', 'local_compute_preferred', 'input_summary'], requestPath);
        if (error) return error;
        for (const field of ['job_type', 'target_id', 'project_id']) {
          error = requireString(preview.recommended_job_request[field], `${requestPath}.${field}`);
          if (error) return error;
        }
        if (!analysisJobTypes.has(preview.recommended_job_request.job_type)) return `${requestPath}.job_type is invalid`;
        if (preview.recommended_job_request.target_id !== preview.target_id) return `${requestPath}.target_id must match preview.target_id`;
        if (preview.recommended_job_request.project_id !== file.project.id) return `${requestPath}.project_id must match project.id`;
        if (preview.recommended_job_request.local_compute_preferred != null && typeof preview.recommended_job_request.local_compute_preferred !== 'boolean') return `${requestPath}.local_compute_preferred must be a boolean`;
        if (preview.recommended_job_request.input_summary != null) {
          error = requireObject(preview.recommended_job_request.input_summary, `${requestPath}.input_summary`);
          if (error) return error;
        }
      }
      for (const field of ['geometry_source', 'units', 'freecad_document', 'gmsh_model', 'calculix_input_deck']) {
        if (preview.solver_inputs[field] != null) {
          const scalarError = requireString(preview.solver_inputs[field], `${previewPath}.solver_inputs.${field}`);
          if (scalarError) return scalarError;
        }
      }
      if (preview.solver_inputs.mesh_size_mm != null) {
        error = requireFiniteNumber(preview.solver_inputs.mesh_size_mm, `${previewPath}.solver_inputs.mesh_size_mm`, Number.MIN_VALUE);
        if (error) return error;
      }
      error = requireStringArray(preview.solver_inputs.notes, `${previewPath}.solver_inputs.notes`);
      if (error) return error;
      error = requireStringArray(preview.criteria, `${previewPath}.criteria`) || requireStringArray(preview.review_required, `${previewPath}.review_required`) || requireStringArray(preview.demo_estimates, `${previewPath}.demo_estimates`);
      if (error) return error;
      for (const [artifactIndex, artifact] of preview.expected_result_artifacts.entries()) {
        const artifactPath = `${previewPath}.expected_result_artifacts[${artifactIndex}]`;
        error = rejectUnknownFields(artifact, ['kind', 'title', 'file_format', 'produced_by', 'replaces_demo_estimate', 'review_required_before_release'], artifactPath);
        if (error) return error;
        error = requiredFields(artifact, ['kind', 'title', 'file_format', 'produced_by', 'replaces_demo_estimate', 'review_required_before_release'], artifactPath);
        if (error) return error;
        for (const field of ['kind', 'title', 'file_format', 'produced_by']) {
          error = requireString(artifact[field], `${artifactPath}.${field}`);
          if (error) return error;
        }
        for (const field of ['replaces_demo_estimate', 'review_required_before_release']) {
          if (typeof artifact[field] !== 'boolean') return `${artifactPath}.${field} must be a boolean`;
        }
      }
      const pipelineStatuses = new Set(['stub_contract', 'ready_for_worker', 'unavailable_review_required', 'blocked_missing_input', 'completed_by_solver']);
      for (const [stepIndex, step] of preview.solver_pipeline.entries()) {
        const stepPath = `${previewPath}.solver_pipeline[${stepIndex}]`;
        error = rejectUnknownFields(step, ['order', 'adapter_name', 'open_source_tool', 'action', 'consumes', 'produces', 'status', 'review_notes'], stepPath);
        if (error) return error;
        error = requiredFields(step, ['order', 'adapter_name', 'open_source_tool', 'action', 'consumes', 'produces', 'status', 'review_notes'], stepPath);
        if (error) return error;
        if (!Number.isInteger(step.order) || step.order < 1) return `${stepPath}.order must be a positive integer`;
        for (const field of ['adapter_name', 'open_source_tool', 'action', 'status']) {
          error = requireString(step[field], `${stepPath}.${field}`);
          if (error) return error;
        }
        if (!pipelineStatuses.has(step.status)) return `${stepPath}.status is invalid`;
        for (const field of ['consumes', 'produces', 'review_notes']) {
          error = requireStringArray(step[field], `${stepPath}.${field}`);
          if (error) return error;
        }
      }
      if (preview.project_id !== file.project.id) return `${previewPath}.project_id must match project.id`;
      if (previewTargetIds.has(preview.target_id)) return `${previewPath}.target_id must be unique across readiness previews`;
      previewTargetIds.add(preview.target_id);
      const target = targets.get(preview.target_id);
      if (!target) return `${previewPath}.target_id references an unknown project target`;
      if (preview.target_kind !== target.kind || preview.target_name !== target.name) return `${previewPath} target metadata does not match the project target`;
      for (const field of ['load_cases', 'constraints']) {
        for (const [nestedIndex, nested] of preview[field].entries()) {
          const nestedPath = `${previewPath}.${field}[${nestedIndex}]`;
          const nestedUnknownError = rejectUnknownFields(nested, field === 'load_cases'
            ? ['id', 'name', 'description', 'load_type', 'target_part_ids', 'magnitude', 'unit', 'direction', 'application_region', 'confidence', 'review_required']
            : ['id', 'name', 'constraint_type', 'target_part_ids', 'region', 'degrees_of_freedom', 'confidence', 'review_required'], nestedPath);
          if (nestedUnknownError) return nestedUnknownError;
          const requiredNestedFields = field === 'load_cases'
            ? ['id', 'name', 'description', 'load_type', 'target_part_ids', 'direction', 'application_region', 'confidence', 'review_required']
            : ['id', 'name', 'constraint_type', 'target_part_ids', 'region', 'degrees_of_freedom', 'confidence', 'review_required'];
          const nestedError = requiredFields(nested, requiredNestedFields, nestedPath);
          if (nestedError) return nestedError;
          const targetPartsError = requireArray(nested.target_part_ids, `${nestedPath}.target_part_ids`);
          if (targetPartsError) return targetPartsError;
          const directionOrDofError = field === 'load_cases'
            ? requireObject(nested.direction, `${nestedPath}.direction`)
            : requireArray(nested.degrees_of_freedom, `${nestedPath}.degrees_of_freedom`);
          if (directionOrDofError) return directionOrDofError;
          if (field === 'load_cases') {
            const directionUnknownError = rejectUnknownFields(nested.direction, ['x', 'y', 'z'], `${nestedPath}.direction`);
            if (directionUnknownError) return directionUnknownError;
            for (const axis of ['x', 'y', 'z']) {
              const vectorError = requireFiniteScalar(nested.direction[axis], `${nestedPath}.direction.${axis}`);
              if (vectorError) return vectorError;
            }
            if (nested.magnitude != null) {
              const magnitudeError = requireFiniteScalar(nested.magnitude, `${nestedPath}.magnitude`);
              if (magnitudeError) return magnitudeError;
            }
            if (nested.unit != null) {
              const unitError = requireString(nested.unit, `${nestedPath}.unit`);
              if (unitError) return unitError;
            }
          }
          for (const scalarField of field === 'load_cases'
            ? ['id', 'name', 'description', 'load_type', 'application_region', 'confidence']
            : ['id', 'name', 'constraint_type', 'region', 'confidence']) {
            const scalarError = requireString(nested[scalarField], `${nestedPath}.${scalarField}`);
            if (scalarError) return scalarError;
          }
          if (typeof nested.review_required !== 'boolean') return `${nestedPath}.review_required must be a boolean`;
          const nestedEnum = field === 'load_cases' ? nested.load_type : nested.constraint_type;
          const enumValues = field === 'load_cases' ? readinessLoadTypes : readinessConstraintTypes;
          if (!(enumValues.has(nestedEnum))) return `${nestedPath}.${field === 'load_cases' ? 'load_type' : 'constraint_type'} is invalid`;
          if (!new Set(['verified_from_authoritative_source', 'verified_from_manufacturer_data', 'calculated_from_user_inputs', 'estimated_from_heuristic', 'unknown_or_needs_review']).has(nested.confidence)) return `${nestedPath}.confidence is invalid`;
          if (field === 'constraints') error = requireStringArray(nested.degrees_of_freedom, `${nestedPath}.degrees_of_freedom`);
          if (error) return error;
          for (const partId of nested.target_part_ids) if (!partIds.has(partId)) return `${nestedPath}.target_part_ids references an unknown part ${partId}`;
        }
      }
    }
  }
  return null;
};

const findTarget = (targetId) => {
  for (const assembly of project.assemblies) {
    const part = assembly.parts.find((candidate) => candidate.id === targetId);
    if (part) return { target: part, kind: 'part', partIds: [part.id] };
    if (assembly.id === targetId) return { target: assembly, kind: 'assembly', partIds: assembly.parts.map((part) => part.id) };
  }
  return null;
};

const createMockPreSolverJob = (targetId) => {
  const found = findTarget(targetId);
  if (!found) return null;
  const now = new Date().toISOString();
  const jobId = `job-${randomUUID()}`;
  const artifact = {
    id: `artifact-${randomUUID()}`,
    job_id: jobId,
    kind: 'fea_summary',
    title: 'Local pre-solver screening package, not FEA',
    summary: 'Mock backend packaged readiness-shaped inputs. No FreeCAD geometry prep, Gmsh mesh, or CalculiX solve was run.',
    payload: {
      artifact_contract: 'local_pre_solver_screening_v1_mock',
      trust_label: 'demo_pre_solver_not_fea',
      target: {
        project_id: projectId,
        target_id: targetId,
        target_name: found.target.name,
        target_kind: found.kind,
      },
      demo_screening_estimates: {
        method: 'mock_pre_solver_screen_v1',
        disclaimer: 'Mock estimate only. This is not FEA and must be replaced by real solver and test evidence.',
      },
      tool_boundaries: localSolverToolBoundaries(),
      result_label: 'review_required_not_fea',
    },
    confidence: 'estimated_from_heuristic',
    generated_by: 'local-pre-solver-runner',
    created_at: now,
  };
  return {
    id: jobId,
    job_type: 'run_fea',
    status: 'completed',
    target_id: targetId,
    project_id: projectId,
    adapter_name: 'local-pre-solver-runner',
    local_compute_preferred: true,
    input_summary: {
      source: 'mock pre-solver run endpoint',
      target_part_ids: found.partIds,
    },
    result_summary: {
      message: 'Mock local pre-solver screening completed. This is not a real FEA result; review remains required.',
      progress: 100,
      runner: 'local-pre-solver-runner',
      trust_label: 'demo_pre_solver_not_fea',
      review_status: 'review_required',
      artifact_id: artifact.id,
      artifact_kind: artifact.kind,
      unavailable_solver_tools: ['FreeCAD', 'Gmsh', 'CalculiX'],
    },
    artifacts: [artifact],
    created_at: now,
    updated_at: now,
  };
};

const isOriginAllowed = (request) => {
  const origin = request.headers.origin;
  return !origin || corsOrigins.has('*') || corsOrigins.has(origin);
};

const corsHeaders = (request) => {
  const origin = request.headers.origin;
  if (!origin) return {};
  if (corsOrigins.has('*')) return { 'access-control-allow-origin': '*' };
  return isOriginAllowed(request)
    ? { 'access-control-allow-origin': origin, vary: 'Origin' }
    : { vary: 'Origin' };
};

const sendJson = (request, response, statusCode, payload) => {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...corsHeaders(request),
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
};

const readJsonBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const isProjectPath = (pathname, suffix = '') =>
  pathname === `/api/projects/${projectId}${suffix}` || pathname === `/api/projects/sample${suffix}`;

const server = http.createServer(async (request, response) => {
  const send = (statusCode, payload) => sendJson(request, response, statusCode, payload);
  try {
    if (!request.url) {
      send(400, { error: 'Missing URL' });
      return;
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        ...corsHeaders(request),
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      response.end();
      return;
    }

    const url = new URL(request.url, `http://${host}:${port}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      send(200, {
        status: 'ok',
        service: 'mechaflow-cad-mock-api',
        version: mockBackendMetadata.version,
        environment: 'local-mock',
        local_mode: true,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/metadata') {
      send(200, mockBackendMetadata);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/catalog/seed') {
      send(200, { ...mockCatalogSeed, materials: project.materials, sample_project: project });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/reference-designs') {
      send(200, mockReferenceDesigns);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/materials') {
      send(200, project.materials);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/task-requirements/sample') {
      send(200, mockTaskRequirements);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/assemblies/sample') {
      send(200, project.assemblies[0]);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/projects') {
      send(200, [project]);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/export-file')) {
      send(200, projectFile());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/projects/import-file') {
      if (!isOriginAllowed(request)) {
        send(403, { error: 'origin is not allowed' });
        return;
      }
      const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        send(415, { error: 'content-type must be application/json' });
        return;
      }
      let body;
      try {
        body = await readJsonBody(request);
      } catch {
        send(422, { error: 'request body must contain valid JSON' });
        return;
      }
      const requestedProjectId = url.searchParams.get('project_id');
      if (requestedProjectId !== null && (
        requestedProjectId === 'sample'
        || requestedProjectId === '.'
        || requestedProjectId === '..'
        || !projectIdPattern.test(requestedProjectId)
      )) {
        send(422, { error: 'project_id must be a URL-safe path segment' });
        return;
      }
      const normalizedBody = body && typeof body === 'object' && !Array.isArray(body)
        && body.project && typeof body.project === 'object' && !Array.isArray(body.project)
        ? normalizeProjectFileDefaults(body)
        : body;
      const validationError = projectFileValidationError(normalizedBody);
      if (validationError) {
        send(422, { error: validationError });
        return;
      }
      const importedProject = structuredClone(normalizedBody.project);
      const resolvedProjectId = requestedProjectId ?? importedProject.id;
      const sourceProjectId = importedProject.id;
      importedProject.id = resolvedProjectId;
      for (const job of importedProject.analysis_jobs) {
        if (job.project_id === sourceProjectId) job.project_id = resolvedProjectId;
      }
      for (const report of importedProject.reports) {
        if (report.project_id === sourceProjectId) report.project_id = resolvedProjectId;
      }
      project = {
        ...importedProject,
        updated_at: new Date().toISOString(),
      };
      projectId = resolvedProjectId;
      analysisReadinessPreviews = Array.isArray(normalizedBody.analysis_readiness_previews)
        ? structuredClone(normalizedBody.analysis_readiness_previews).map((preview) => ({
          ...preview,
          project_id: resolvedProjectId,
          recommended_job_request: preview.recommended_job_request
            ? { ...preview.recommended_job_request, project_id: resolvedProjectId }
            : preview.recommended_job_request,
        }))
        : [];
      send(200, {
        status: 'imported',
        project_id: projectId,
        message: `Imported MechaFlow project file for ${projectId}.`,
        warnings: [],
        project,
        panel_data: projectPanelData(),
      });
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname)) {
      send(200, project);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/panel-data')) {
      send(200, projectPanelData());
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/task-requirements')) {
      send(200, projectPanelData().task_requirements);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/bom')) {
      send(200, projectPanelData().bom_items);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/manufacturing-options')) {
      send(200, projectManufacturingOptions());
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/wiring-routes')) {
      send(200, projectPanelData().wiring_routes);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/reports')) {
      send(200, project.reports);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/local-analysis/tool-boundaries') {
      send(200, localSolverToolBoundaries());
      return;
    }

    if (request.method === 'POST' && isProjectPath(url.pathname, '/analysis-jobs/pre-solver-runs')) {
      if (!isOriginAllowed(request)) {
        send(403, { error: 'origin is not allowed' });
        return;
      }
      const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        send(415, { error: 'content-type must be application/json' });
        return;
      }
      let body;
      try {
        body = await readJsonBody(request);
      } catch {
        send(422, { error: 'request body must contain valid JSON' });
        return;
      }
      if (!body || typeof body.target_id !== 'string') {
        send(422, { error: 'target_id is required' });
        return;
      }
      const job = createMockPreSolverJob(body.target_id);
      if (!job) {
        send(404, { error: 'analysis target not found' });
        return;
      }
      project = {
        ...project,
        analysis_jobs: [job, ...project.analysis_jobs],
        updated_at: new Date().toISOString(),
      };
      send(202, job);
      return;
    }

    if (request.method === 'POST' && isProjectPath(url.pathname, '/modifications')) {
      if (!isOriginAllowed(request)) {
        send(403, { error: 'origin is not allowed' });
        return;
      }
      const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        send(415, { error: 'content-type must be application/json' });
        return;
      }
      let modification;
      try {
        modification = await readJsonBody(request);
      } catch {
        send(422, { error: 'request body must contain valid JSON' });
        return;
      }
      const validationError = modificationValidationError(modification);
      if (validationError) {
        send(422, { error: validationError });
        return;
      }
      const parts = project.assemblies.flatMap((assembly) => assembly.parts);
      const part = parts.find((candidate) => candidate.id === modification.target_part_id);
      if (!part) {
        send(404, { error: 'target part not found' });
        return;
      }
      const materialChanged = modification.material_id != null && modification.material_id !== part.material_id;
      if (materialChanged || modification.manufacturing_process) {
        const materialId = modification.material_id ?? part.material_id;
        const material = project.materials.find((candidate) => candidate.id === materialId);
        const partProcesses = new Set(
          part.manufacturing_options.map((option) => option.process).filter((process) => process !== 'unknown'),
        );
        const materialProcesses = material?.compatible_processes.filter((process) => process !== 'unknown') ?? [];
        const compatibleProcesses = materialProcesses.filter((process) => partProcesses.has(process));
        const currentProcess = typeof part.metadata?.preferred_manufacturing_process === 'string'
          ? part.metadata.preferred_manufacturing_process
          : undefined;
        const effectiveProcess = modification.manufacturing_process ?? currentProcess;
        if (!material) {
          send(422, { error: 'material not found' });
          return;
        }
        if (partProcesses.size === 0 || materialProcesses.length === 0) {
          send(422, { error: 'material and process compatibility requires review' });
          return;
        }
        if (materialChanged && !effectiveProcess) {
          send(422, { error: 'material changes require an explicit compatible manufacturing process' });
          return;
        }
        if (
          compatibleProcesses.length === 0
          || (effectiveProcess && !compatibleProcesses.includes(effectiveProcess))
        ) {
          send(422, { error: 'material and process are incompatible for this part' });
          return;
        }
      }
      const dimensionChanges = modification.dimension_changes ?? {};
      const changedDimensionKeys = Object.keys(dimensionChanges).filter(
        (field) => dimensionChanges[field] !== part.dimensions[field],
      );
      const currentProcess = typeof part.metadata?.preferred_manufacturing_process === 'string'
        ? part.metadata.preferred_manufacturing_process
        : undefined;
      const processChanged = modification.manufacturing_process != null
        && modification.manufacturing_process !== currentProcess;
      const massPropertiesChanged = materialChanged || changedDimensionKeys.length > 0;
      const report = {
        id: `report-${modification.id ?? 'mock-modification'}`,
        project_id: projectId,
        title: 'Advisory edit report from mock backend',
        status: 'requires_review',
        summary: massPropertiesChanged
          ? 'Mock backend accepted the local schema edit and would queue CAD, payload, wiring, and supplier workers next.'
          : 'Mock backend accepted the local schema edit without a material or dimension change requiring re-rating.',
        task_results: [{
          task_kind: 'lift_payload',
          status: 'requires_review',
          method: 'local_schema_update_only',
          notes: [
            materialChanged ? `Material changed to ${modification.material_id}.` : 'Material unchanged.',
            changedDimensionKeys.length > 0
              ? `Dimensions changed: ${changedDimensionKeys.sort().join(', ')}.`
              : 'No dimensions changed.',
            processChanged
              ? `Preferred process changed to ${modification.manufacturing_process}.`
              : 'Manufacturing process unchanged.',
          ],
        }],
        manufacturing_impacts: [
          processChanged
            ? `Preferred process changed to ${modification.manufacturing_process}.`
            : 'Manufacturing process unchanged.',
        ],
        wiring_impacts: ['Wiring clearance remains advisory until a worker validates geometry.'],
        risks: [
          'Local edit preview does not modify CAD geometry yet.',
          ...(massPropertiesChanged
            ? ['Strength, payload, and fatigue changes are advisory until CAD and FEA workers validate them.']
            : []),
        ],
        unknowns: [
          ...(massPropertiesChanged
            ? ['Updated mass properties are unknown until a CAD worker recalculates them.']
            : []),
          'Supplier cost and lead time are unknown until a supplier adapter runs.',
        ],
        recommendations: massPropertiesChanged
          ? ['Queue estimate_mass_properties and rerate_payload_capability.']
          : [],
        assumptions: ['Mock endpoint mirrors the backend modification contract.'],
        generated_at: new Date().toISOString(),
      };
      const storedModification = {
        created_at: new Date().toISOString(),
        dimension_changes: {},
        ...modification,
      };
      const updatedAssemblies = project.assemblies.map((assembly) => ({
        ...assembly,
        parts: assembly.parts.map((candidate) => {
          if (candidate.id !== modification.target_part_id) return candidate;
          return {
            ...candidate,
            material_id: modification.material_id ?? candidate.material_id,
            mass_kg: massPropertiesChanged ? null : candidate.mass_kg,
            dimensions: {
              ...candidate.dimensions,
              ...dimensionChanges,
            },
            metadata: modification.manufacturing_process
              ? {
                  ...candidate.metadata,
                  preferred_manufacturing_process: modification.manufacturing_process,
                }
              : candidate.metadata,
          };
        }),
      }));
      project = {
        ...project,
        assemblies: updatedAssemblies,
        modifications: [...project.modifications, storedModification],
        reports: [...project.reports, report],
        updated_at: new Date().toISOString(),
      };
      analysisReadinessPreviews = [];
      send(200, {
        project,
        report,
      });
      return;
    }

    send(404, { error: 'Not found' });
  } catch (error) {
    send(500, { error: error instanceof Error ? error.message : 'Unexpected mock backend error' });
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Mock backend could not start because ${host}:${port} is already in use.`);
    console.error('Pick another port with BACKEND_PORT or run npm run ports:find.');
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Mock MechaFlow CAD API listening at http://${host}:${port}`);
  console.log(`Use VITE_API_BASE_URL=http://${host}:${port} when starting the frontend.`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
