import { describe, expect, it } from 'vitest';
import { evaluatePublicationPath, isForbiddenRef } from '../scripts/validate-publication-path.mjs';

describe('publication path validation', () => {
  it('accepts a publication branch that descends from the PR target and supported reboot base', () => {
    const result = evaluatePublicationPath({
      candidateRef: 'integration/precision-cad-canvas-reboot-2026-10',
      targetRef: 'origin/main',
      targetAncestorOfCandidate: true,
      supportedBaseRef: 'fm/cad-workspace-reboot-a1',
      supportedBaseAncestorOfCandidate: true,
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects the historical student integration branch even when it is target-based', () => {
    const result = evaluatePublicationPath({
      candidateRef: 'integration/student-cad-improvements',
      targetRef: 'origin/main',
      targetAncestorOfCandidate: true,
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toMatch(/forbidden historical publication path/);
  });

  it('rejects branches that have not been rebased onto the target before PR review', () => {
    const result = evaluatePublicationPath({
      candidateRef: 'integration/precision-cad-canvas-reboot-2026-10',
      targetRef: 'origin/main',
      targetAncestorOfCandidate: false,
      supportedBaseRef: 'fm/cad-workspace-reboot-a1',
      supportedBaseAncestorOfCandidate: true,
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toMatch(/rebase before PR review/);
  });

  it('preserves evidence when a historical branch is parallel to the supported reboot base', () => {
    const result = evaluatePublicationPath({
      candidateRef: 'integration/precision-cad-canvas-reboot-2026-10',
      targetRef: 'origin/main',
      targetAncestorOfCandidate: true,
      supportedBaseRef: 'fm/cad-workspace-reboot-a1',
      supportedBaseAncestorOfCandidate: true,
      evidenceBranches: [
        {
          ref: 'fm/student-cad-section2',
          exists: true,
          relatedToSupportedBase: false,
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain('evidence branch fm/student-cad-section2 is not base-consistent with fm/cad-workspace-reboot-a1');
  });

  it('treats remote-qualified forbidden refs as the same unsupported path', () => {
    expect(isForbiddenRef('origin/integration/student-cad-improvements')).toBe(true);
  });
});
