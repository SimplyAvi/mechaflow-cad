export interface CadLifecycleMapping {
  id: string;
  publicCadConcept: string;
  mechaflowMvpRepresentation: string;
  dataPersistence: string;
  apiAndWorkerBoundary: string;
}

export const cadLifecycleMappings: CadLifecycleMapping[] = [
  {
    id: 'plane-sketch-dimensions',
    publicCadConcept: 'Plane selection, sketches, dimensions, and relations',
    mechaflowMvpRepresentation: 'On-model annotations plus viewport sketch state store the selected plane, 2D profile, constraint summary, units, and editable dimension callouts beside the 3D part.',
    dataPersistence: 'part.dimensions.metadata.viewport_sketch_state plus visual_authoring_mvp part output previews preserve the authored intent in project files.',
    apiAndWorkerBoundary: 'Future FreeCAD workers consume this as intent for source CAD creation. The MVP does not claim a solved parametric sketch.',
  },
  {
    id: 'features-history-configurations',
    publicCadConcept: 'Extrude, cut, revolve, chamfer, fillet, feature history, and configurations',
    mechaflowMvpRepresentation: 'On-model feature annotations and feature recipes record ordered sketch, extrude, cut, and finish steps plus callouts. Requirement upgrades act as deterministic configuration snapshots.',
    dataPersistence: 'part.authoring.featureRecipe, design criteria, and load-sizing upgrade criteria travel with the assembly and export.',
    apiAndWorkerBoundary: 'Backend endpoints keep review-required metadata until a CAD kernel and configuration worker produce authoritative geometry variants.',
  },
  {
    id: 'materials-hardware-standards',
    publicCadConcept: 'Material assignment, mechanical properties, standard hardware libraries, and fasteners',
    mechaflowMvpRepresentation: 'Local material records, manufacturing options, deterministic fastener choices, and hole patterns drive on-model annotations, viewport controls, and load triage.',
    dataPersistence: 'material_id, manufacturing_options, fasteners, hole_pattern metadata, BOM rows, and FEA-input previews are persisted.',
    apiAndWorkerBoundary: 'Catalog and material endpoints provide seed data only. Standards-grade hardware claims remain review-required until licensed data and supplier validation exist.',
  },
  {
    id: 'assemblies-mates-bom-drawings',
    publicCadConcept: 'Assemblies, mates, constraints, drawings, BOM, and neutral exports',
    mechaflowMvpRepresentation: 'Assembly nodes, parent part links, joint types, wiring routes, selected fasteners, and drawing previews keep the robot hand or arm context intact.',
    dataPersistence: 'assemblies, nodes, transforms, wiring_routes, bom_items, part_outputs, and analysis readiness previews are included in .mfcad.json.',
    apiAndWorkerBoundary: 'Project-file, panel-data, BOM, and report endpoints expose lifecycle handoff data. Released CAD drawings, STEP, DXF, and supplier packages require future workers.',
  },
  {
    id: 'simulation-fea-setup',
    publicCadConcept: 'Simulation setup with study type, material, loads, fixtures, mesh, contacts, connectors, and results',
    mechaflowMvpRepresentation: 'On-model load annotations and FEA input previews collect geometry dimensions, material properties, payload, self-weight, constraints, selected fasteners, contacts, assumptions, and pre-solver notes.',
    dataPersistence: 'analysis_readiness_previews, active task requirements, part_outputs.feaInput, analysis jobs, and solver input specs travel with the project.',
    apiAndWorkerBoundary: 'Local pre-solver packages future inputs and solver readiness. The MVP does not run full assembly FEA or certify results.',
  },
];

export const buildCadLifecycleExportMap = () => ({
  source_note: 'Original MechaFlow mapping from public CAD process concepts. This is not SOLIDWORKS compatibility and does not copy proprietary UI or assets.',
  mappings: cadLifecycleMappings,
});
