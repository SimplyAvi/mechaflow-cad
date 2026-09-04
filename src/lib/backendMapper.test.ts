import { describe, expect, it } from 'vitest';
import { mockBackendMetadata, mockProjectPanelData } from '../data/mockDesign';
import { mapProjectPanelDataToReferenceDesign } from './backendMapper';

describe('mapProjectPanelDataToReferenceDesign', () => {
  it('marks a heavy part as high stress risk', () => {
    const design = mapProjectPanelDataToReferenceDesign(mockProjectPanelData, mockBackendMetadata);

    expect(design.assembly.parts.find((part) => part.id === 'part-palm-plate')?.stressRisk).toBe('high');
  });

  it('keeps service-loop state unknown without explicit backend evidence', () => {
    const design = mapProjectPanelDataToReferenceDesign(mockProjectPanelData, mockBackendMetadata);

    expect(design.wiringRoutes.every((route) => route.serviceLoop === null)).toBe(true);
  });

  it('maps only explicit task, hierarchy, and analysis values', () => {
    const design = mapProjectPanelDataToReferenceDesign(mockProjectPanelData, mockBackendMetadata);
    const finger = design.assembly.parts.find((part) => part.id === 'part-finger-link');

    expect(design.task.cycleTimeSeconds).toBeNull();
    expect(design.task.reachMeters).toBeNull();
    expect(design.assembly.explodedProgress).toBe(100);
    expect(finger?.subassembly).toBe('Finger subassembly');
    expect(finger?.visual.explodeX).toBe(20);
  });

  it('uses the active safety-factor requirement for part and substitution ratings', () => {
    const panelData = structuredClone(mockProjectPanelData);
    panelData.project.active_task!.safety_factor_min = 1.5;
    const designWithLowerMinimum = mapProjectPanelDataToReferenceDesign(
      panelData,
      mockBackendMetadata,
      'http://api.test',
    );
    const finger = designWithLowerMinimum.assembly.parts.find((part) => part.id === 'part-finger-link');
    expect(finger?.rating.safetyFactor).toBe(1.7);
    expect(finger?.rating.status).toBe('passes');

    panelData.project.active_task!.safety_factor_min = 3;

    const design = mapProjectPanelDataToReferenceDesign(panelData, mockBackendMetadata, 'http://api.test');
    const steelOption = design.materialOptions.find(
      (option) => option.id === 'part-finger-link-mat-low-carbon-steel',
    );

    expect(steelOption?.safetyFactor).toBe(2.5);
    expect(steelOption?.status).toBe('watch');
    expect(steelOption?.taskImpact).toMatch(/below the preserved 3\.0 minimum/i);

    panelData.project.active_task!.safety_factor_min = null;
    const designWithoutMinimum = mapProjectPanelDataToReferenceDesign(panelData, mockBackendMetadata, 'http://api.test');
    const optionWithoutMinimum = designWithoutMinimum.materialOptions.find(
      (option) => option.id === 'part-finger-link-mat-low-carbon-steel',
    );

    expect(optionWithoutMinimum?.status).toBe('watch');
    expect(optionWithoutMinimum?.taskImpact).toMatch(/minimum is unknown.*review is required/i);
  });

  it('keeps missing values and non-USD costs unknown', () => {
    const panelData = structuredClone(mockProjectPanelData);
    const finger = panelData.project.assemblies[0]!.parts.find((part) => part.id === 'part-finger-link')!;
    finger.mass_kg = null;
    const aluminum = panelData.project.materials.find((material) => material.id === 'mat-aluminum-6061-t6')!;
    aluminum.cost!.currency = 'EUR';
    panelData.bom_items[0]!.price = {
      currency: 'EUR',
      min: 14,
      max: 20,
      confidence: 'estimated_from_heuristic',
    };
    panelData.manufacturing_options[0]!.options[0]!.cost!.currency = 'credits';

    const design = mapProjectPanelDataToReferenceDesign(panelData, mockBackendMetadata, 'http://api.test');

    const mappedFinger = design.assembly.parts.find((part) => part.id === finger.id);
    const mappedPalm = design.assembly.parts.find((part) => part.id === 'part-palm-plate');
    const steelOption = design.materialOptions.find(
      (option) => option.id === 'part-finger-link-mat-low-carbon-steel',
    );
    expect(mappedFinger?.stressRisk).toBe('unknown');
    expect(mappedPalm?.estimatedCostUsd).toBeNull();
    expect(steelOption?.costDeltaUsd).toBeNull();
    expect(design.bom[0]?.unitCostUsd).toBeNull();
    expect(design.manufacturingOptions[0]?.estimatedCostUsd).toBe('Cost review required');
    expect(design.backend.source).toBe('backend-panel-data');
  });

  it('maps every assembly, defaults to selectable parts, and keeps the full worker fallback', () => {
    const panelData = structuredClone(mockProjectPanelData);
    const populated = panelData.project.assemblies[0]!;
    const empty = {
      ...structuredClone(populated),
      id: 'assembly-empty',
      name: 'Empty assembly',
      parts: [],
      wiring_routes: [],
    };
    panelData.project.assemblies = [empty, populated];

    const design = mapProjectPanelDataToReferenceDesign(panelData);

    expect(design.assemblies.map((assembly) => assembly.id)).toEqual(['assembly-empty', populated.id]);
    expect(design.assembly.id).toBe(populated.id);
    expect(design.assembly.parts.length).toBeGreaterThan(0);
    expect(design.backend.integrationStubs).toContain('kicad-electronics-worker');
  });
});
