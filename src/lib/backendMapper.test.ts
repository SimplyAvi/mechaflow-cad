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

  it('keeps clearance under review without an explicit backend result or threshold', () => {
    const design = mapProjectPanelDataToReferenceDesign(mockProjectPanelData, mockBackendMetadata);

    expect(design.wiringRoutes.every((route) => route.clearanceStatus === 'watch')).toBe(true);
  });

  it('maps only explicit task, hierarchy, and analysis values', () => {
    const design = mapProjectPanelDataToReferenceDesign(mockProjectPanelData, mockBackendMetadata);
    const finger = design.assembly.parts.find((part) => part.id === 'part-finger-link');

    expect(design.task.cycleTimeSeconds).toBe(8);
    expect(design.task.reachMeters).toBe(0.65);
    expect(design.assembly.explodedProgress).toBe(100);
    expect(finger?.subassembly).toBe('Wrist gripper tool');
    expect(finger?.visual.explodeX).toBe(32);
    expect(finger?.visual.shape).toBe('tool');
    expect(finger?.designCriteria[0]?.sourceConfidence).toMatch(/Part metadata demo estimate/i);
  });

  it('does not derive a physical payload rating from the task target', () => {
    const panelData = structuredClone(mockProjectPanelData);
    panelData.project.active_task!.target_value = 50;
    const designWithLowerTarget = mapProjectPanelDataToReferenceDesign(
      panelData,
      mockBackendMetadata,
      'http://api.test',
    );
    const lowerTargetRating = designWithLowerTarget.assembly.parts.find(
      (part) => part.id === 'part-finger-link',
    )?.rating;

    panelData.project.active_task!.target_value = 100;

    const designWithHigherTarget = mapProjectPanelDataToReferenceDesign(
      panelData,
      mockBackendMetadata,
      'http://api.test',
    );
    const higherTargetRating = designWithHigherTarget.assembly.parts.find(
      (part) => part.id === 'part-finger-link',
    )?.rating;

    expect(lowerTargetRating).toEqual(higherTargetRating);
    expect(higherTargetRating?.payloadLb).toBeNull();
    expect(higherTargetRating?.safetyFactor).toBeNull();
    expect(higherTargetRating?.status).toBe('watch');
    expect(higherTargetRating?.summary).toMatch(/no worker-supplied payload rating/i);
  });

  it('keeps unrated parts and material previews under review', () => {
    const design = mapProjectPanelDataToReferenceDesign(mockProjectPanelData, mockBackendMetadata, 'http://api.test');
    const finger = design.assembly.parts.find((part) => part.id === 'part-finger-link');
    const steelOption = design.materialOptions.find(
      (option) => option.id === 'part-finger-link-mat-low-carbon-steel',
    );

    expect(finger?.rating.payloadLb).toBeNull();
    expect(finger?.rating.safetyFactor).toBeNull();
    expect(finger?.rating.status).toBe('watch');
    expect(steelOption?.payloadLb).toBeNull();
    expect(steelOption?.safetyFactor).toBeNull();
    expect(steelOption?.status).toBe('watch');
    expect(steelOption?.taskImpact).toMatch(/no worker-supplied payload rating.*review is required/i);
  });

  it('keeps unrated material previews material-only', () => {
    const design = mapProjectPanelDataToReferenceDesign(
      structuredClone(mockProjectPanelData),
      mockBackendMetadata,
      'http://api.test',
    );
    const compositeOption = design.materialOptions.find(
      (option) => option.id === 'part-finger-link-mat-carbon-fiber-nylon',
    );

    expect(compositeOption?.backendModification.payload.dimension_changes).toEqual({});
    expect(compositeOption?.payloadLb).toBeNull();
    expect(compositeOption?.weightDeltaLb).toBe(-0.13);
    expect(compositeOption?.taskImpact).toMatch(/no worker-supplied payload rating/i);
    expect(compositeOption?.backendModification.payload.description).toMatch(
      /material-only preview/i,
    );
  });

  it('uses explicit BOM processes and preserves one-sided lead-time bounds', () => {
    const panelData = structuredClone(mockProjectPanelData);
    const finger = panelData.project.assemblies[0]!.parts.find((part) => part.id === 'part-finger-link')!;
    finger.manufacturing_options[0]!.process = 'off_the_shelf';
    panelData.bom_items = [{
      ...panelData.bom_items[0]!,
      part_id: finger.id,
      name: 'Finger replacement',
      supplier: null,
      supplier_part_number: null,
    }];
    const option = panelData.manufacturing_options[0]!.options[0]!;
    panelData.manufacturing_options[0]!.options = [
      { ...option, id: 'minimum-only', lead_time_days_min: 3, lead_time_days_max: null },
      { ...option, id: 'maximum-only', lead_time_days_min: null, lead_time_days_max: 3 },
    ];

    const design = mapProjectPanelDataToReferenceDesign(panelData, mockBackendMetadata, 'http://api.test');

    expect(design.bom[0]?.source).toBe('off the shelf');
    expect(design.manufacturingOptions.find((item) => item.id.endsWith('minimum-only'))?.leadTime)
      .toBe('From 3 days');
    expect(design.manufacturingOptions.find((item) => item.id.endsWith('maximum-only'))?.leadTime)
      .toBe('Up to 3 days');
  });

  it('falls back to an available manufacturing option when the preference is stale', () => {
    const panelData = structuredClone(mockProjectPanelData);
    const finger = panelData.project.assemblies[0]!.parts.find((part) => part.id === 'part-finger-link')!;
    finger.metadata.preferred_manufacturing_process = 'laser_cutting';

    const design = mapProjectPanelDataToReferenceDesign(panelData, mockBackendMetadata);
    const mappedFinger = design.assembly.parts.find((part) => part.id === finger.id);

    expect(mappedFinger?.manufacturingProcess).toBe('Cnc Machining');
    expect(mappedFinger?.costRangeUsd).toEqual({ min: 25, max: 80 });
  });

  it('keeps missing values and non-USD costs unknown', () => {
    const panelData = structuredClone(mockProjectPanelData);
    const finger = panelData.project.assemblies[0]!.parts.find((part) => part.id === 'part-finger-link')!;
    finger.mass_kg = null;
    finger.manufacturing_options[0]!.cost!.currency = 'credits';
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
    const steelOption = design.materialOptions.find(
      (option) => option.id === 'part-finger-link-mat-low-carbon-steel',
    );
    expect(mappedFinger?.stressRisk).toBe('unknown');
    expect(mappedFinger?.costRangeUsd).toBeNull();
    expect(steelOption?.costRangeUsd).toBeNull();
    expect(design.bom[0]?.unitCostRangeUsd).toBeNull();
    expect(design.manufacturingOptions[0]?.costDisplay).toBe('Cost review required');
    expect(design.backend.source).toBe('backend-panel-data');
  });

  it('preserves explicit manufacturing and BOM cost ranges', () => {
    const panelData = structuredClone(mockProjectPanelData);
    panelData.manufacturing_options[0]!.options[0]!.cost = {
      currency: 'USD',
      min: 0.1,
      max: 0.2,
      confidence: 'estimated_from_heuristic',
    };
    panelData.bom_items[0]!.price = {
      currency: 'USD',
      min: 14,
      max: 20,
      confidence: 'estimated_from_heuristic',
    };

    const design = mapProjectPanelDataToReferenceDesign(panelData, mockBackendMetadata, 'http://api.test');
    const finger = design.assembly.parts.find((part) => part.id === 'part-finger-link');
    const compositeOption = design.materialOptions.find(
      (option) => option.id === 'part-finger-link-mat-carbon-fiber-nylon',
    );

    expect(finger?.costRangeUsd).toEqual({ min: 25, max: 80 });
    expect(compositeOption?.costRangeUsd).toEqual({ min: 3, max: 12 });
    expect(design.bom[0]?.unitCostRangeUsd).toEqual({ min: 14, max: 20 });
    expect(design.manufacturingOptions[0]?.costDisplay).toBe('$0.10-$0.20');
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
    finger.manufacturing_options[0]!.cost!.currency = 'credits';
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
    const steelOption = design.materialOptions.find(
      (option) => option.id === 'part-finger-link-mat-low-carbon-steel',
    );
    expect(mappedFinger?.stressRisk).toBe('unknown');
    expect(mappedFinger?.costRangeUsd).toBeNull();
    expect(steelOption?.costRangeUsd).toBeNull();
    expect(design.bom[0]?.unitCostRangeUsd).toBeNull();
    expect(design.manufacturingOptions[0]?.costDisplay).toBe('Cost review required');
    expect(design.backend.source).toBe('backend-panel-data');
  });

  it('preserves explicit manufacturing and BOM cost ranges', () => {
    const panelData = structuredClone(mockProjectPanelData);
    panelData.bom_items[0]!.price = {
      currency: 'USD',
      min: 14,
      max: 20,
      confidence: 'estimated_from_heuristic',
    };

    const design = mapProjectPanelDataToReferenceDesign(panelData, mockBackendMetadata, 'http://api.test');
    const finger = design.assembly.parts.find((part) => part.id === 'part-finger-link');
    const compositeOption = design.materialOptions.find(
      (option) => option.id === 'part-finger-link-mat-carbon-fiber-nylon',
    );

    expect(finger?.costRangeUsd).toEqual({ min: 25, max: 80 });
    expect(compositeOption?.costRangeUsd).toEqual({ min: 3, max: 12 });
    expect(design.bom[0]?.unitCostRangeUsd).toEqual({ min: 14, max: 20 });
    expect(design.manufacturingOptions[0]?.costDisplay).toBe('$25-$80');
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
