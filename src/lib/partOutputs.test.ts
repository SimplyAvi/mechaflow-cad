import { describe, expect, it } from 'vitest';
import { mockReferenceDesign } from '../data/mockDesign';
import { assessRobotArmLoadRequirement, estimateAssemblySelfWeightLb } from './loadSizing';
import {
  buildDefaultHolePattern,
  buildPartOutputPreview,
  defaultFastenerForPart,
  defaultSketchStateForPart,
  normalizeHolePattern,
} from './partOutputs';

describe('part output previews', () => {
  it('defaults centered viewport hole placement from selected off-the-shelf fastener size', () => {
    const base = mockReferenceDesign.assembly.parts[0]!;
    const defaultFastener = defaultFastenerForPart(base);
    const holePattern = buildDefaultHolePattern(base, defaultFastener);

    expect(defaultFastener.id).toBe('m8-socket-head');
    expect(holePattern.offsetFromBottomMm).toBe(50.8);
    expect(holePattern.centeredOnWidth).toBe(true);
    expect(holePattern.holeDiameterMm).toBe(defaultFastener.clearanceHoleMm);
    expect(holePattern.notes.join(' ')).toMatch(/2 in from the bottom/);
  });

  it('normalizes viewport hole edits into drawing and FEA previews', () => {
    const upperArm = mockReferenceDesign.assembly.parts.find((part) => part.id === 'part-upper-arm-link')!;
    const holePattern = normalizeHolePattern(upperArm, { fastenerId: 'm6-socket-head', offsetFromBottomMm: 50.8, centeredOnWidth: true });
    const sketchState = defaultSketchStateForPart(upperArm);
    const part = {
      ...upperArm,
      fasteners: [holePattern.fastenerSpec, ...upperArm.fasteners],
      authoring: {
        ...upperArm.authoring,
        holePattern,
        sketchState,
      },
    };
    const loadSizing = assessRobotArmLoadRequirement(mockReferenceDesign.assembly.parts, {
      payloadLb: 75,
      assemblySelfWeightLb: estimateAssemblySelfWeightLb(mockReferenceDesign.assembly.parts),
      reachMeters: 0.65,
      safetyFactor: 2,
    });
    const preview = buildPartOutputPreview(part, 'in', { ...mockReferenceDesign.task, targetPayloadLb: 75 }, loadSizing);

    expect(preview.drawing.title).toMatch(/machinist drawing preview/);
    expect(preview.drawing.holeCallouts.join(' ')).toMatch(/2 in/);
    expect(preview.drawing.fastenerCallouts[0]).toMatch(/M6 class 10.9/);
    expect(preview.feaInput.loads.payloadLb).toBe(75);
    expect(preview.feaInput.loads.assemblySelfWeightLb).toBeGreaterThan(0);
    expect(preview.feaInput.geometry.holePattern?.centeredOnWidth).toBe(true);
    expect(preview.feaInput.fasteners.join(' ')).toMatch(/M6 class 10.9/);
    expect(preview.feaInput.assumptions.join(' ')).toMatch(/Payload plus self-weight/);
    expect(preview.lifecycleEvidence.items.map((item) => item.editableKind)).toEqual(expect.arrayContaining(['dimension', 'constraint', 'feature', 'hole', 'material', 'mate', 'load', 'drawing']));
    expect(preview.lifecycleEvidence.downstreamImpactSummary).toEqual(expect.arrayContaining(['drawing dimensions', 'feature tree']));
  });
});
