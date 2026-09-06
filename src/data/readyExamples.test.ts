import { describe, expect, it } from 'vitest';
import { buildReadyExampleDesign } from './readyExamples';
import { mockReferenceDesign } from './mockDesign';

describe('ready example isolation', () => {
  it('removes backend bindings and derived analysis state', () => {
    const baseDesign = structuredClone(mockReferenceDesign);
    const example = buildReadyExampleDesign(baseDesign, 'robot-arm-gripper');

    expect(example.backend.apiBaseUrl).toBeUndefined();
    expect(example.backend.projectId).toBe('project-robot-arm-gripper-example');
    expect(example.analysisJobs).toEqual([]);
    expect(example.reports).toEqual([]);
    expect(example.wiringReview).toBeNull();
  });
});
