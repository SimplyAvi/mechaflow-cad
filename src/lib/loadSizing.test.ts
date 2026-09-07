import { describe, expect, it } from 'vitest';
import { mockReferenceDesign } from '../data/mockDesign';
import { remapDesignFromProject } from './visualAuthoring';
import { applyRobotArmLoadFixesToProject, assessRobotArmLoadRequirement, estimateAssemblySelfWeightLb } from './loadSizing';

describe('requirements-driven robot-arm load sizing', () => {
  it('accounts for payload plus assembly self-weight and flags the 75 lb upsize path', () => {
    const selfWeightLb = estimateAssemblySelfWeightLb(mockReferenceDesign.assembly.parts);
    const baseline = assessRobotArmLoadRequirement(mockReferenceDesign.assembly.parts, {
      payloadLb: 50,
      assemblySelfWeightLb: selfWeightLb,
      reachMeters: mockReferenceDesign.task.reachMeters ?? 0.65,
      safetyFactor: mockReferenceDesign.task.safetyFactorMin ?? 2,
    });
    const upscaled = assessRobotArmLoadRequirement(mockReferenceDesign.assembly.parts, {
      payloadLb: 75,
      assemblySelfWeightLb: selfWeightLb,
      reachMeters: mockReferenceDesign.task.reachMeters ?? 0.65,
      safetyFactor: mockReferenceDesign.task.safetyFactorMin ?? 2,
    });

    expect(selfWeightLb).toBeGreaterThan(7);
    expect(baseline.workingLoadLb).toBeCloseTo(50 + selfWeightLb, 1);
    expect(baseline.designReviewLoadLb).toBeCloseTo(baseline.workingLoadLb * 2, 1);
    expect(upscaled.workingLoadLb).toBeGreaterThan(baseline.workingLoadLb);
    expect(upscaled.undersizedCount).toBeGreaterThan(baseline.undersizedCount);
    expect(upscaled.impactedPartIds).toContain('part-shoulder-servo-actuator');
    expect(upscaled.findings.some((finding) => finding.checkKind === 'actuator_torque' && finding.status === 'undersized')).toBe(true);
    expect(upscaled.findings.some((finding) => finding.checkKind === 'fastener_capacity' && finding.fix?.upgradeId === 'upgrade-m8-class-10-9-fastener-set')).toBe(true);
    expect(upscaled.assumptions.join(' ')).toMatch(/payload plus the visible assembly self-weight/i);
  });

  it('applies deterministic catalog-backed fixes that reduce undersized findings', () => {
    const selfWeightLb = estimateAssemblySelfWeightLb(mockReferenceDesign.assembly.parts);
    const upscaled = assessRobotArmLoadRequirement(mockReferenceDesign.assembly.parts, {
      payloadLb: 75,
      assemblySelfWeightLb: selfWeightLb,
      reachMeters: mockReferenceDesign.task.reachMeters ?? 0.65,
      safetyFactor: mockReferenceDesign.task.safetyFactorMin ?? 2,
    });
    const actionable = upscaled.findings.filter((finding) => finding.status === 'undersized' && finding.fix);

    const fixedProject = applyRobotArmLoadFixesToProject(mockReferenceDesign.backendProject, actionable, upscaled.requirement);
    const fixedDesign = remapDesignFromProject(mockReferenceDesign, fixedProject);
    const fixedAssessment = assessRobotArmLoadRequirement(fixedDesign.assembly.parts, upscaled.requirement);
    const fixedServo = fixedProject.assemblies[0]!.parts.find((part) => part.id === 'part-shoulder-servo-actuator')!;
    const fixedLink = fixedProject.assemblies[0]!.parts.find((part) => part.id === 'part-upper-arm-link')!;

    expect(actionable.length).toBeGreaterThan(0);
    expect(fixedAssessment.undersizedCount).toBeLessThan(upscaled.undersizedCount);
    expect(fixedServo.dimensions.metadata.nominal_output_torque_nm).toBe(36);
    expect(fixedServo.related_fasteners.every((fastener) => fastener.startsWith('m8-10.9'))).toBe(true);
    expect(fixedLink.metadata.requirement_sizing_upgrade).toEqual(expect.objectContaining({ review_required: true }));
    expect(fixedLink.metadata.demo_design_criteria).toEqual(expect.objectContaining({ load_capacity_lb: expect.any(Number) }));
    expect(fixedDesign.assembly.parts.find((part) => part.id === 'part-shoulder-servo-actuator')?.designCriteria.some((criterion) => criterion.id === 'actuator-torque')).toBe(true);
  });
});
