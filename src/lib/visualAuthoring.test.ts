import { describe, expect, it } from 'vitest';
import { mockReferenceDesign } from '../data/mockDesign';
import {
  buildLocalProjectFile,
  createPrimitivePart,
  createWireRoute,
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
});
