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

  it('keeps missing mass risk and invalid currency unknown', () => {
    const panelData = structuredClone(mockProjectPanelData);
    const finger = panelData.project.assemblies[0]!.parts.find((part) => part.id === 'part-finger-link')!;
    finger.mass_kg = null;
    panelData.manufacturing_options[0]!.options[0]!.cost!.currency = 'credits';

    const design = mapProjectPanelDataToReferenceDesign(panelData, mockBackendMetadata, 'http://api.test');

    expect(design.assembly.parts.find((part) => part.id === finger.id)?.stressRisk).toBe('unknown');
    expect(design.manufacturingOptions[0]?.estimatedCostUsd).toBe('Cost review required');
    expect(design.backend.source).toBe('backend-panel-data');
  });
});
