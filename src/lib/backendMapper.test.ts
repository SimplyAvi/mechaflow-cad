import { describe, expect, it } from 'vitest';
import { mockBackendMetadata, mockProjectPanelData } from '../data/mockDesign';
import { mapProjectPanelDataToReferenceDesign } from './backendMapper';

describe('mapProjectPanelDataToReferenceDesign', () => {
  it('marks a heavy part as high stress risk', () => {
    const design = mapProjectPanelDataToReferenceDesign(mockProjectPanelData, mockBackendMetadata);

    expect(design.assembly.parts.find((part) => part.id === 'part-palm-plate')?.stressRisk).toBe('high');
  });
});
