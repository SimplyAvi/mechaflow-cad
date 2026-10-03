# Precision CAD Canvas reboot section publication path

This note is for future locally accepted Workshed / MechaFlow CAD Precision CAD Canvas reboot sections. It is infrastructure guidance only. Current local product development and acceptance remain unblocked by this publication path.

## Supported branch model

Use the current default branch as the GitHub PR target:

- PR target: `origin/main` / GitHub `main`.
- Future publication branch shape: `integration/precision-cad-canvas-reboot-<short-topic>` or a short `fm/...` task branch when firstmate owns the PR.
- Local acceptance base: the latest locally accepted Precision CAD Canvas reboot line, currently represented in this worktree by `fm/cad-workspace-reboot-a1` at `636bb348df68cb1d8b8b8fc4dbdcb727ac25c6fd`.

Before recommending a section for GitHub review, prove both relationships explicitly:

```sh
git fetch origin --prune
git merge-base --is-ancestor origin/main <publication-branch>
git merge-base --is-ancestor <accepted-reboot-base> <publication-branch>
npm run publication:path -- --candidate <publication-branch> --target origin/main --supported-base <accepted-reboot-base>
```

If `origin/main` has advanced and the accepted stack must be rebased, rebase the whole accepted reboot stack, then review with `git range-diff` before opening a PR. Do not publish a cherry-picked tail that drops earlier locally accepted reboot dependencies.

## Historical path that is not supported

Do not use `integration/student-cad-improvements` for future reboot-section publication.

Evidence preserved from this worktree:

```sh
git ls-remote --heads origin | grep -E 'integration|student|section'
# no origin ref for integration/student-cad-improvements

git show-ref | grep -E 'integration/student-cad-improvements'
# no local ref for integration/student-cad-improvements

git merge-base fm/cad-workspace-reboot-a1 fm/mf-student-cad-gnhf-a1
# 0cddc675994b3035b40e349cc98dbedc4b3c43dd

git rev-list --left-right --count fm/cad-workspace-reboot-a1...fm/mf-student-cad-gnhf-a1
# 159 106

git merge-base fm/cad-workspace-reboot-a1 fm/student-cad-section2
# 0cddc675994b3035b40e349cc98dbedc4b3c43dd

git rev-list --left-right --count fm/cad-workspace-reboot-a1...fm/student-cad-section2
# 159 120
```

The visible student section branches are parallel to the accepted reboot line: neither is an ancestor of `fm/cad-workspace-reboot-a1`, and `fm/cad-workspace-reboot-a1` is not their ancestor. That makes them unsuitable as a base-consistent continuation path for future Precision CAD Canvas reboot publication. This evidence does not validate, rescue, normalize, or publish the rejected September 2026 section1 or section2 UI direction.

## Review, rebase, and PR behavior

Use this direct path when a future section has already been accepted locally:

1. Fetch `origin` and confirm the publication branch is clean.
2. Confirm `origin/main` is an ancestor of the publication branch.
3. Confirm the latest accepted reboot base is an ancestor of the publication branch, or, after a whole-stack rebase, run and retain `git range-diff <old-base>..<old-head> <new-base>..<new-head>` evidence.
4. Run the local checks appropriate to the changed surface. For this publication-path infrastructure, the focused checks are `npm test -- tests/publication-path.test.mjs` and `npm run publication:path -- --candidate HEAD --target origin/main`.
5. Push only the publication branch.
6. Open a PR with `gh-axi pr create --base main --head <publication-branch>`. Never merge from this lane.

The repository script checks branch ancestry and rejects the historical `integration/student-cad-improvements` path by name. It intentionally does not inspect or validate rejected UI content.
