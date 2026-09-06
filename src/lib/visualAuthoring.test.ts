import { describe, expect, it } from 'vitest';
import { mockReferenceDesign } from '../data/mockDesign';
import {
  buildLocalProjectFile,
  connectPartToParent,
  createAssemblyWithBase,
  createPrimitivePart,
  createWireRoute,
  deleteVisualPart,
  remapDesignFromProject,
  updateProjectUnits,
} from './visualAuthoring';

describe('visual authoring project helpers', () => {
  it('exports seeded and edited canvas metadata into portable project files', () => {
    const unitProject = updateProjectUnits(mockReferenceDesign.backendProject, 'in');
    const design = remapDesignFromProject(mockReferenceDesign, unitProject);

    const projectFile = buildLocalProjectFile(design);
    const firstPart = projectFile.project.assemblies[0]!.parts[0]!;
    const visual = firstPart.metadata.visual_authoring as Record<string, unknown>;

    expect(projectFile.project.units).toBe('in');
    expect(projectFile.project.metadata?.visual_authoring).toEqual(expect.objectContaining({ units: 'in' }));
    expect(visual).toEqual(expect.objectContaining({
      primitive: 'base_plate',
      joint_type: 'unassigned',
    }));
    expect(visual.position_mm).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) }));
    expect(firstPart.dimensions.length_mm).toBe(design.assemblies[0]!.parts[0]!.authoring.dimensionsMm.lengthMm);
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
    const grandchild = createPrimitivePart(child.project, createdAssembly.assemblyId, 'bracket', child.partId);
    const linkedChild = connectPartToParent(child.project, child.partId, createdAssembly.partId, 'fixed');
    const linkedGrandchild = connectPartToParent(linkedChild, grandchild.partId, child.partId, 'revolute');

    const deleted = deleteVisualPart(linkedGrandchild, createdAssembly.assemblyId, child.partId);
    const remaining = deleted.project.assemblies.find((assembly) => assembly.id === createdAssembly.assemblyId)?.parts
      .find((part) => part.id === grandchild.partId);
    const visual = remaining?.metadata.visual_authoring as Record<string, unknown>;

    expect(deleted.deleted).toBe(true);
    expect(visual.parent_part_id).toBeNull();
    expect(visual.joint_type).toBe('unassigned');
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
});
