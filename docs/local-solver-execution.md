# Local solver execution and readiness

MechaFlow CAD now separates three analysis states:

1. **Pre-solver readiness** - local API and desktop data package loads, constraints, material provenance, expected solver files, and demo screening estimates. This is not FEA.
2. **Solver readiness fixture** - the backend can generate a deterministic CalculiX `.inp` deck and, when `ccx` is on `PATH`, invoke CalculiX against that tiny fixture. A successful fixture proves executable solver plumbing only. It is not analysis of the selected part or assembly.
3. **Full project FEA** - future work. Real part analysis still requires FreeCAD geometry preparation, Gmsh mesh generation, CalculiX solve execution, mesh quality evidence, solver logs, and engineering review.

No fake FEA results should be presented as real analysis. If a local solver is missing, the API returns `solver_unavailable` or `unavailable_review_required` with exact missing tools and setup guidance.

## Intended open-source stack

The local-first stack is:

- FreeCAD, preferably `freecadcmd`, for geometry preparation, units, named faces, and material handoff.
- Gmsh, `gmsh`, for finite-element mesh generation and mesh-quality metadata.
- CalculiX, preferably `ccx`, for static structural solving and result files.

The current executable subset is the CalculiX fixture boundary. FreeCAD and Gmsh are detected and reported, but full project geometry and meshing workers are not implemented yet.

## Install tools locally

Install commands vary by operating system. Prefer package-manager installs that keep binaries on `PATH`.

macOS with Homebrew:

```bash
brew install freecad gmsh calculix-ccx
```

Linux examples:

```bash
sudo apt-get install freecad gmsh calculix-ccx
```

or use your distribution package names for FreeCAD, Gmsh, and CalculiX if they differ.

After install, verify commands are visible:

```bash
which freecadcmd || which freecad || which FreeCAD
which gmsh
which ccx || which calculix
```

## API checks

Inspect local tool boundaries:

```bash
curl -s http://127.0.0.1:8123/api/local-analysis/tool-boundaries | python -m json.tool
```

Inspect combined solver readiness:

```bash
curl -s http://127.0.0.1:8123/api/local-analysis/solver-readiness | python -m json.tool
```

Generate a pre-solver package without invoking solvers:

```bash
curl -s -X POST http://127.0.0.1:8123/api/projects/project-open-gripper-demo/analysis-jobs/pre-solver-runs \
  -H 'Content-Type: application/json' \
  -d '{"target_id":"part-finger-link"}' | python -m json.tool
```

Generate or run the CalculiX readiness fixture:

```bash
curl -s -X POST http://127.0.0.1:8123/api/projects/project-open-gripper-demo/analysis-jobs/solver-readiness-runs \
  -H 'Content-Type: application/json' \
  -d '{"target_id":"part-finger-link"}' | python -m json.tool
```

If CalculiX is missing, this endpoint returns a persisted `solver_unavailable` job with the generated `.inp` deck manifest and install guidance. If CalculiX is available, it invokes the deterministic fixture and collects stdout, stderr, `.dat`, `.frd`, `.sta`, and `.cvg` files where produced.

Fixture files are copied into `.mechaflow-artifacts/<job-id>/` and are downloadable through the `download_url` in each file manifest entry. The local artifact store retains bundles for 7 days and caps storage at 100 bundles, pruning older bundles when a new run starts. Temporary execution directories are removed after collection.

## What is real analysis today

Real today:

- Local command detection for FreeCAD, Gmsh, and CalculiX.
- Generated solver-readiness fixture input deck.
- Real CalculiX subprocess execution for the deterministic fixture when `ccx` is present.
- Artifact provenance, logs, generated input file previews, expected outputs, and unavailable-tool guidance.

Not real project FEA yet:

- Importing project geometry into FreeCAD for analysis.
- Generating a Gmsh mesh from selected MechaFlow parts.
- Running CalculiX against the selected part or assembly.
- Reporting project stress, displacement, safety factor, or payload rating as solver results.

The desktop demo labels these states distinctly so pre-solver estimates, unavailable tools, fixture execution, and future solver results are not confused.
