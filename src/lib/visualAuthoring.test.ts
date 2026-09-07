import { describe, expect, it } from 'vitest';
import { matchLocalPartCatalog } from '../data/localPartCatalog';
import { mockReferenceDesign } from '../data/mockDesign';
import {
  applyCatalogMatchToPart,
  buildLocalProjectFile,
  connectPartToParent,
  createAssemblyWithBase,
  createPrimitivePart,
  createWireRoute,
  deleteVisualPart,
  remapDesignFromProject,
  updatePartGeometry,
  updateProjectUnits,
} from './visualAuthoring';

describe('visual authoring project helpers', () => {
  it('exports seeded and edited canvas metadata into portable project files', () => {
    const unitProject = updateProjectUnits(mockReferenceDesign.backendProject, 'in');
    const holePattern = {
      id: 'hole-pattern-part-palm-plate',
      label: 'Centered clearance hole from viewport',
      fastenerId: 'm6-socket-head',
      fastenerLabel: 'M6 socket head screw',
      fastenerSpec: 'M6 class 10.9 socket head cap screw',
      holeDiameterMm: 6.6,
      offsetFromBottomMm: 50.8,
      centeredOnWidth: true,
      count: 2,
      source: 'viewport-fastener-default',
      notes: ['Hole placed 2 in from bottom in the viewport editor.'],
    };
    const sketchState = {
      plane: 'Front plane',
      profile: 'Centered rectangle profile with construction centerlines',
      constraintSummary: 'Centered profile with hole center constrained on width.',
      extrudeDepthMm: 10,
      operation: 'cut' as const,
      definitionState: 'fully-defined' as const,
      provenance: 'user-defined' as const,
      notes: ['Viewport sketch metadata.'],
    };
    const labeledProject = updatePartGeometry(unitProject, 'part-palm-plate', {
      label: 'Bench-mounted base proxy',
      fasteners: [holePattern.fastenerSpec],
      holePattern,
      sketchState,
    });
    const design = remapDesignFromProject(mockReferenceDesign, labeledProject);

    const projectFile = buildLocalProjectFile(design);
    const firstPart = projectFile.project.assemblies[0]!.parts[0]!;
    const visual = firstPart.metadata.visual_authoring as Record<string, unknown>;
    const visualExtension = projectFile.extensions.visual_authoring_mvp as Record<string, unknown>;

    expect(projectFile.project.units).toBe('in');
    expect(firstPart.name).toBe('Bench-mounted base proxy');
    expect(projectFile.project.metadata?.visual_authoring).toEqual(expect.objectContaining({ units: 'in' }));
    expect(visual).toEqual(expect.objectContaining({
      primitive: 'base_plate',
      joint_type: 'unassigned',
      hole_pattern: expect.objectContaining({ offsetFromBottomMm: 50.8, centeredOnWidth: true }),
      sketch_state: expect.objectContaining({ plane: 'Front plane', operation: 'cut', definitionState: 'fully-defined', provenance: 'user-defined' }),
    }));
    expect(visual.position_mm).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) }));
    expect(firstPart.dimensions.metadata.visual_hole_pattern).toEqual(expect.objectContaining({ fastenerLabel: 'M6 socket head screw' }));
    expect(firstPart.dimensions.length_mm).toBe(design.assemblies[0]!.parts[0]!.authoring.dimensionsMm.lengthMm);
    expect(design.assemblies[0]!.parts[0]!.authoring.sketchState).toEqual(expect.objectContaining({ definitionState: 'fully-defined', provenance: 'user-defined' }));
    expect(design.assemblies[0]!.parts[0]!.designCriteria.some((criterion) => criterion.id === 'hole-fastener-placement')).toBe(true);
    expect(visualExtension.part_outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        drawing: expect.objectContaining({ title: expect.stringMatching(/machinist drawing preview/i) }),
        feaInput: expect.objectContaining({ title: expect.stringMatching(/FEA input preview/i) }),
        lifecycleEvidence: expect.objectContaining({
          automationBoundary: expect.stringMatching(/user-defined, inferred, defaulted, estimated, unresolved, or invalid/i),
          items: expect.arrayContaining([expect.objectContaining({ editableKind: 'dimension' })]),
        }),
      }),
    ]));
    expect(visualExtension.cad_lifecycle_map).toEqual(expect.objectContaining({
      source_note: expect.stringMatching(/not SOLIDWORKS compatibility/i),
      mappings: expect.arrayContaining([
        expect.objectContaining({ id: 'plane-sketch-dimensions' }),
        expect.objectContaining({ id: 'simulation-fea-setup' }),
      ]),
    }));
  });

  it('creates motor primitives and persisted visual wire routes', () => {
    const assemblyId = mockReferenceDesign.assembly.id;
    const created = createPrimitivePart(mockReferenceDesign.backendProject, assemblyId, 'motor_block', 'part-palm-plate');
    const routed = createWireRoute(created.project, assemblyId, created.partId, 'part-palm-plate');
    const design = remapDesignFromProject(mockReferenceDesign, routed.project);

    expect(created.partId).toMatch(/^part-motor-block/);
    expect(routed.routeId).toMatch(/^route-/);
    expect(design.assembly.parts.find((part) => part.id === created.partId)?.authoring.primitive).toBe('motor_block');
    expect(design.wiringRoutes.find((route) => route.id === routed.routeId)?.connectedParts)
      .toEqual(expect.arrayContaining([created.partId, 'part-palm-plate']));
    expect(routed.project.wire_segments.some((segment) => segment.from_endpoint?.part_id === created.partId || segment.to_endpoint?.part_id === created.partId)).toBe(true);
  });

  it('applies a local catalog match to a newly authored part while keeping it editable', () => {
    const assemblyId = mockReferenceDesign.assembly.id;
    const created = createPrimitivePart(mockReferenceDesign.backendProject, assemblyId, 'beam', 'part-palm-plate');
    const match = matchLocalPartCatalog('joint motor')[0]!;
    const matchedProject = applyCatalogMatchToPart(created.project, created.partId, match.item, { ...match, query: 'joint motor' });
    const matchedPart = matchedProject.assemblies[0]!.parts.find((part) => part.id === created.partId)!;
    const visual = matchedPart.metadata.visual_authoring as Record<string, unknown>;
    const localMatch = matchedPart.metadata.local_catalog_match as Record<string, unknown>;

    expect(matchedPart.name).toBe('Integrated 80 mm shoulder servo actuator');
    expect(matchedPart.material_id).toBe('mat-servo-actuator-assembly');
    expect(matchedProject.materials.some((material) => material.id === 'mat-servo-actuator-assembly')).toBe(true);
    expect(matchedPart.dimensions.length_mm).toBe(86);
    expect(matchedPart.source_file).toBeNull();
    expect(matchedPart.manufacturing_options[0]?.process).toBe('off_the_shelf');
    expect(visual.primitive).toBe('motor_block');
    expect(visual.authored).toBe(true);
    expect(localMatch.score).toBeGreaterThanOrEqual(70);
    expect(localMatch.editable).toBe(true);
    expect(localMatch.catalog_uri).toBe('local-catalog://catalog-shoulder-servo-actuator-80mm');

    const design = remapDesignFromProject(mockReferenceDesign, matchedProject);
    const selected = design.assembly.parts.find((part) => part.id === created.partId)!;
    expect(selected.designCriteria.some((criterion) => criterion.id === 'catalog-match')).toBe(true);
  });

  it('persists guided sleeve feature recipes through visual project remapping', () => {
    const assemblyId = mockReferenceDesign.assembly.id;
    const created = createPrimitivePart(mockReferenceDesign.backendProject, assemblyId, 'cylinder_joint', 'part-shoulder-yoke');
    const match = matchLocalPartCatalog('round arm connector with diagonal slots')[0]!;
    const matchedProject = applyCatalogMatchToPart(created.project, created.partId, match.item, { ...match, query: 'round arm connector with diagonal slots' });
    const matchedPart = matchedProject.assemblies[0]!.parts.find((part) => part.id === created.partId)!;
    const visual = matchedPart.metadata.visual_authoring as Record<string, unknown>;

    expect(match.item.id).toBe('catalog-lightened-joint-sleeve-coupler');
    expect(visual.feature_recipe).toEqual(expect.objectContaining({ id: 'recipe-lightened-joint-sleeve-coupler' }));

    const design = remapDesignFromProject(mockReferenceDesign, matchedProject);
    const selected = design.assembly.parts.find((part) => part.id === created.partId)!;
    expect(selected.authoring.featureRecipe?.history.some((step) => step.kind === 'cut')).toBe(true);
    expect(selected.designCriteria.some((criterion) => criterion.id === 'feature-recipe')).toBe(true);
  });

  it('rejects parent links that would create an assembly cycle', () => {
    const createdAssembly = createAssemblyWithBase(mockReferenceDesign.backendProject);
    const child = createPrimitivePart(createdAssembly.project, createdAssembly.assemblyId, 'beam', createdAssembly.partId);
    const linkedChild = connectPartToParent(child.project, child.partId, createdAssembly.partId, 'fixed');

    const rejected = connectPartToParent(linkedChild, createdAssembly.partId, child.partId, 'revolute');
    const base = rejected.assemblies.find((assembly) => assembly.id === createdAssembly.assemblyId)?.parts
      .find((part) => part.id === createdAssembly.partId);
    const visual = base?.metadata.visual_authoring as Record<string, unknown>;

    expect(visual.parent_part_id).toBeNull();
  });

  it('clears child parent metadata when an authored parent is deleted', () => {
    const createdAssembly = createAssemblyWithBase(mockReferenceDesign.backendProject);
    const child = createPrimitivePart(createdAssembly.project, createdAssembly.assemblyId, 'beam', createdAssembly.partId);
    const grandchild = createPrimitivePart(child.project, createdAssembly.assemblyId, 'motor_block', child.partId);
    const linkedChild = connectPartToParent(grandchild.project, child.partId, createdAssembly.partId, 'fixed');
    const linkedGrandchild = connectPartToParent(linkedChild, grandchild.partId, child.partId, 'revolute');

    const deleted = deleteVisualPart(linkedGrandchild, createdAssembly.assemblyId, child.partId);
    const remaining = deleted.project.assemblies.find((assembly) => assembly.id === createdAssembly.assemblyId)?.parts
      .find((part) => part.id === grandchild.partId);
    const visual = remaining?.metadata.visual_authoring as Record<string, unknown>;

    expect(deleted.deleted).toBe(true);
    expect(visual.parent_part_id).toBeNull();
    expect(visual.joint_type).toBe('unassigned');
    expect(visual.assigned_to_part_id).toBeNull();
  });

  it('rejects parent links and wire routes across assemblies', () => {
    const first = createAssemblyWithBase(mockReferenceDesign.backendProject);
    const second = createAssemblyWithBase(first.project);
    const rejectedParent = connectPartToParent(second.project, first.partId, second.partId, 'fixed');
    const rejectedRoute = createWireRoute(second.project, first.assemblyId, first.partId, second.partId);

    const firstPart = rejectedParent.assemblies.find((assembly) => assembly.id === first.assemblyId)?.parts
      .find((part) => part.id === first.partId);
    const visual = firstPart?.metadata.visual_authoring as Record<string, unknown>;
    const firstAssembly = rejectedRoute.project.assemblies.find((assembly) => assembly.id === first.assemblyId);

    expect(visual.parent_part_id).toBeNull();
    expect(rejectedRoute.routeId).toBe('');
    expect(firstAssembly?.wiring_routes).toHaveLength(0);
  });

  it('requires an existing target assembly and same-assembly parent when creating parts', () => {
    const first = createAssemblyWithBase(mockReferenceDesign.backendProject);
    const second = createAssemblyWithBase(first.project);

    const crossAssembly = createPrimitivePart(second.project, second.assemblyId, 'beam', first.partId);
    const invalidAssembly = createPrimitivePart(second.project, 'missing-assembly', 'beam', null);

    expect(crossAssembly.partId).toBe('');
    expect(invalidAssembly.partId).toBe('');
    expect(invalidAssembly.project.assemblies).toHaveLength(second.project.assemblies.length);
  });

  it('preserves valid dimensions when geometry updates are nonpositive or nonfinite', () => {
    const partId = mockReferenceDesign.assembly.parts[0]!.id;
    const original = mockReferenceDesign.backendProject.assemblies[0]!.parts[0]!.dimensions;
    const updated = updatePartGeometry(mockReferenceDesign.backendProject, partId, {
      dimensions: {
        lengthMm: 0,
        widthMm: -1,
        heightMm: Number.NaN,
        diameterMm: Number.POSITIVE_INFINITY,
        thicknessMm: Number.NEGATIVE_INFINITY,
      },
    });
    const part = updated.assemblies[0]!.parts.find((candidate) => candidate.id === partId)!;

    expect(part.dimensions).toEqual(original);
  });
});
