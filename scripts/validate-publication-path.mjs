#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

export const DEFAULT_FORBIDDEN_REFS = ['integration/student-cad-improvements'];

export function isForbiddenRef(ref, forbiddenRefs = DEFAULT_FORBIDDEN_REFS) {
  return forbiddenRefs.some((forbiddenRef) => ref === forbiddenRef || ref.endsWith(`/${forbiddenRef}`));
}

export function evaluatePublicationPath({
  candidateRef,
  targetRef,
  targetAncestorOfCandidate,
  supportedBaseRef = null,
  supportedBaseAncestorOfCandidate = null,
  forbiddenRefs = DEFAULT_FORBIDDEN_REFS,
  evidenceBranches = [],
}) {
  const issues = [];
  const warnings = [];

  if (candidateRef === targetRef) {
    issues.push(`candidate ${candidateRef} is the target ref; use a publication branch`);
  }

  if (isForbiddenRef(candidateRef, forbiddenRefs)) {
    issues.push(`candidate ${candidateRef} is a forbidden historical publication path`);
  }

  if (isForbiddenRef(targetRef, forbiddenRefs)) {
    issues.push(`target ${targetRef} is a forbidden historical publication path`);
  }

  if (!targetAncestorOfCandidate) {
    issues.push(`target ${targetRef} is not an ancestor of candidate ${candidateRef}; rebase before PR review`);
  }

  if (supportedBaseRef && isForbiddenRef(supportedBaseRef, forbiddenRefs)) {
    issues.push(`supported base ${supportedBaseRef} is a forbidden historical publication path`);
  }

  if (supportedBaseRef && supportedBaseAncestorOfCandidate === false) {
    issues.push(`supported base ${supportedBaseRef} is not an ancestor of candidate ${candidateRef}; do not mix parallel section stacks`);
  }

  for (const branch of evidenceBranches) {
    if (!branch.exists) {
      warnings.push(`evidence branch ${branch.ref} is absent in this checkout`);
      continue;
    }

    if (isForbiddenRef(branch.ref, forbiddenRefs)) {
      warnings.push(`evidence branch ${branch.ref} is a forbidden historical path`);
    }

    if (supportedBaseRef && branch.relatedToSupportedBase === false) {
      warnings.push(`evidence branch ${branch.ref} is not base-consistent with ${supportedBaseRef}`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
  };
}

function parseArgs(argv) {
  const options = {
    candidateRef: 'HEAD',
    targetRef: 'origin/main',
    supportedBaseRef: null,
    forbiddenRefs: [...DEFAULT_FORBIDDEN_REFS],
    evidenceRefs: [],
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`${arg} requires a value`);
      }
      return argv[index];
    };

    if (arg === '--candidate') {
      options.candidateRef = value();
    } else if (arg === '--target') {
      options.targetRef = value();
    } else if (arg === '--supported-base') {
      options.supportedBaseRef = value();
    } else if (arg === '--forbid') {
      options.forbiddenRefs.push(value());
    } else if (arg === '--evidence-branch') {
      options.evidenceRefs.push(value());
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option ${arg}`);
    }
  }

  return options;
}

function usage() {
  return `Usage: node scripts/validate-publication-path.mjs [options]

Checks that a future Precision CAD Canvas reboot publication branch is safe to review.

Options:
  --candidate <ref>        Branch or ref to publish. Defaults to HEAD.
  --target <ref>           PR target base. Defaults to origin/main.
  --supported-base <ref>   Required accepted reboot base ancestor.
  --forbid <ref>           Extra forbidden historical path. Repeatable.
  --evidence-branch <ref>  Branch to report as related or unrelated to the supported base. Repeatable.
  --json                   Print JSON.
`;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function refExists(ref) {
  try {
    git(['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

function isAncestor(ancestorRef, descendantRef) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestorRef, descendantRef], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function relatedToSupportedBase(ref, supportedBaseRef) {
  if (!supportedBaseRef) {
    return null;
  }
  return isAncestor(ref, supportedBaseRef) || isAncestor(supportedBaseRef, ref);
}

function inspectGit(options) {
  const missing = [options.candidateRef, options.targetRef, options.supportedBaseRef]
    .filter(Boolean)
    .filter((ref) => !refExists(ref));

  if (missing.length > 0) {
    throw new Error(`Unknown git ref(s): ${missing.join(', ')}`);
  }

  return {
    candidateRef: options.candidateRef,
    targetRef: options.targetRef,
    targetAncestorOfCandidate: isAncestor(options.targetRef, options.candidateRef),
    supportedBaseRef: options.supportedBaseRef,
    supportedBaseAncestorOfCandidate: options.supportedBaseRef
      ? isAncestor(options.supportedBaseRef, options.candidateRef)
      : null,
    forbiddenRefs: options.forbiddenRefs,
    evidenceBranches: options.evidenceRefs.map((ref) => {
      const exists = refExists(ref);
      return {
        ref,
        exists,
        relatedToSupportedBase: exists ? relatedToSupportedBase(ref, options.supportedBaseRef) : null,
      };
    }),
  };
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.ok) {
    console.log('publication path check passed');
  } else {
    console.error('publication path check failed');
  }

  for (const issue of result.issues) {
    console.error(`issue: ${issue}`);
  }

  for (const warning of result.warnings) {
    console.warn(`warning: ${warning}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      process.exit(0);
    }

    const inspected = inspectGit(options);
    const result = evaluatePublicationPath(inspected);
    printResult(result, options.json);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exit(2);
  }
}
