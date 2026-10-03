import { describe, expect, it } from 'vitest';
import { mockReferenceDesign } from '../data/mockDesign';
import { buildPartLifecycleEvidence } from './designLifecycle';
import { updatePartGeometry, remapDesignFromProject } from './visualAuthoring';

const selectedPart = mockReferenceDesign.assembly.parts[0]!;

describe('buildPartLifecycleEvidence', () => {
  it('shows incomplete and editable lifecycle state for rough parts', () => {
    const evidence = buildPartLifecycleEvidence(selectedPart, 'mm', { ...mockReferenceDesign.task, reachMeters: null }, undefined);
    expect(evidence.loopStage).toMatch(/rough sketch -> dimensions\/relations -> features -> mates -> analysis -> revise -> drawings\/BOM\/exports/i);
    expect(evidence.automationBoundary).toMatch(/user-defined, inferred, defaulted, estimated, unresolved, or invalid/i);
    expect(evidence.items.map((item) => item.editableKind)).toEqual(expect.arrayContaining(['dimension', 'constraint', 'feature', 'hole', 'material', 'mate', 'load', 'drawing']));
    expect(evidence.items.find((item) => item.id === 'requirements-analysis')?.definitionState).toBe('requirements-incomplete');
  });

  it('marks invalid hole edge distance as an over-defined conflict', () => {
    const project = updatePartGeometry(mockReferenceDesign.backendProject, selectedPart.id, {
      holePattern: {
        id: 'hole-invalid-edge-distance',
        label: 'Invalid edge distance hole',
        fastenerId: 'm8-socket-head',
        fastenerLabel: 'M8 socket head screw',
        fastenerSpec: 'M8 class 10.9 socket head cap screw',
        holeDiameterMm: 9,
        offsetFromBottomMm: 9,
        centeredOnWidth: true,
        count: 1,
        source: 'viewport-user-defined',
        notes: ['Intentionally too close to the edge for lifecycle conflict testing.'],
      },
    });
    const design = remapDesignFromProject(mockReferenceDesign, project);
    const evidence = buildPartLifecycleEvidence(design.assembly.parts[0]!, 'mm', design.task, undefined);
    expect(evidence.overallDefinitionState).toBe('over-defined');
    expect(evidence.items.find((item) => item.id === 'hole-fastener-fit')).toEqual(expect.objectContaining({
      definitionState: 'over-defined',
      provenance: 'user-defined',
    }));
  });

  it.each([
    ['estimated', 'estimated'],
    ['unresolved', 'unresolved'],
    ['invalid', 'invalid'],
    ['defaulted', 'defaulted'],
    ['user-defined', 'user-defined'],
    ['inferred', 'inferred'],
  ] as const)('preserves %s dimension provenance', (provenance, expected) => {
    const part = {
      ...selectedPart,
      authoring: {
        ...selectedPart.authoring,
        authored: true,
        provenance: { dimensions: { lengthMm: provenance } },
      },
    };
    expect(buildPartLifecycleEvidence(part, 'mm', mockReferenceDesign.task).items.find((item) => item.id === 'dimension-definition')?.provenance).toBe(expected);
  });

  it('surfaces the highest-impact feature-step provenance', () => {
    const part = {
      ...selectedPart,
      authoring: {
        ...selectedPart.authoring,
        featureRecipe: {
          id: 'recipe-test',
          name: 'Test recipe',
          plane: 'Front plane',
          profile: 'Test profile',
          history: [{ id: 'step-invalid', label: 'Invalid step', value: 'Needs review', kind: 'finish' as const }],
          callouts: [],
        },
        provenance: { featureRecipe: 'defaulted' as const, featureSteps: { 'step-invalid': 'invalid' as const } },
      },
    };
    expect(buildPartLifecycleEvidence(part, 'mm', mockReferenceDesign.task).items.find((item) => item.id === 'feature-history')?.provenance).toBe('invalid');
  });
});
