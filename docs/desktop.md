# Desktop demo

MechaFlow CAD has a local desktop-openable path for the MVP cockpit. The current shell uses Electron because it opens from the existing Vite and React stack without requiring a Rust toolchain, code signing, or platform SDK setup. Tauri or a signed native installer remains a focused follow-up when the team is ready for release packaging.

## Install

Use Node.js matching the `engines.node` range in `package.json`, then install dependencies:

```sh
npm ci
```

If `npm start` says a local `vite` or `electron` executable is missing, rerun `npm ci` from the repository root.

## Open the desktop demo

Run the captain-friendly command from the repository root:

```sh
npm start
```

`npm run desktop:dev` and `npm run desktop:open` are aliases for the same desktop path. The command starts three local pieces with explicit, non-conflicting ports:

- The Node mock API at a free local port.
- The Vite React cockpit at a free local port.
- An Electron desktop window identified as `MechaFlow CAD` that loads the local cockpit URL.

The mock API is enough to open the desktop cockpit, inspect analysis-readiness data, and see solver-unavailable UI states. To persist and run the FastAPI local pre-solver runner or CalculiX solver-readiness fixture, start the Python backend instead, then launch the frontend with `VITE_API_BASE_URL` pointing at it.

You can pin ports when needed:

```sh
MECHAFLOW_API_PORT=7331 MECHAFLOW_FRONTEND_PORT=7332 npm start
```

If either configured port is already in use, startup fails before orchestration begins and names the busy port. Close the desktop window or press `Ctrl+C` in the terminal to stop the local API and frontend.

## Captain demo script

Use this path for a fresh captain test with no paid services and no privileged solver install:

1. Run `npm ci`, then `npm start` from the repo root.
2. In the `MechaFlow CAD` window, confirm the opening state is 3D-first: the interactive viewport, one `Describe what you want to design...` command line, compact left project browser, and right context inspector are visible before any advanced panel.
3. Type a design intent with payload, dimensions, timing, material, and restrictions, then confirm extracted chips appear. Click `Start design` and verify the app labels the result as a local prompt concept with proxy rendering, not generated CAD.
4. Add one or more reference photos or images by upload or drag/drop. Confirm the UI stores local reference metadata only and does not claim photo-to-CAD reconstruction.
5. Use the left browser to open an existing `.mfcad.json` project through the offline client path, local desktop mock, or backend, reopen the recent project, or load a repository-local ready example. Ready examples are MIT local seeds and do not import external CAD assets.
6. In Design mode, collapse or explode the robot arm, orbit with yaw and pitch, then select a highlighted part or a part-list entry. The part inspector should update and show demo estimate, heuristic, provenance, and review-required labels.
7. Open the right-side `Design and material tools` disclosure, choose a compatible material or process option, and read the projected weight, stiffness, heat, cost, lead time, manufacturing, and wiring impacts. Use `Preview backend impact` before `Apply validated substitution`; preview is non-persisted and apply remains validated and review-required.
8. Switch to Manufacturing mode to review BOM, make or buy paths, wiring, and electronics. Cost and lead time are estimates, wiring checks are deterministic MVP heuristics, and exact electrical or CAD validation remains review-required.
9. Switch to Analysis mode to inspect selected target readiness, local solver tool availability, queued jobs, recommendations, runtime or cost estimates, cached artifacts, and reports. Cloud compute is planning-only. Full project FEA is unavailable until provider approvals and real worker tooling exist.
10. With the one-command desktop mock API or the FastAPI backend connected, run `Run pre-solver screening for ...`. The new job should say `not FEA` and produce a review-required package. Run the solver-readiness fixture if desired; without CalculiX it should produce input artifacts and a solver-unavailable state.
11. Switch to Reports mode, verify cached report and artifact provenance, export `project-open-gripper-demo.mfcad.json`, import it again, and confirm the selected assembly, materials, wiring, analysis queue, cached evidence, and review-required labels survive the round trip.
12. Switch to Backend mode only when you need API handoff details.

A bundled import fixture is available at `data/captain-demo-project.mfcad.json`. It exercises the same integrated path: visual selection, material substitution, BOM and manufacturing, wiring and electronics, solver readiness, local job queue, cached artifact metadata, and project-file import/export.

Run the automated captain smoke before handing off evidence:

```sh
npm run captain:smoke
```

The smoke script launches the Electron desktop smoke path, imports the bundled captain fixture into the local mock API, previews a material substitution, runs local-safe analysis endpoints, confirms solver-unavailable boundaries, and exports the resulting `.mfcad.json` evidence package.

## What to test visually

The desktop demo centers on a robot arm visual MVP with a wrist gripper. The legacy local project id is still `project-open-gripper-demo` so the backend and smoke-test contracts stay compatible, but the bundled visual seed now shows a base, shoulder, upper arm, elbow, forearm, wrist plate, gripper jaw, and controller PCB. In the window, verify that you can:

1. Land on a calm 3D-first cockpit with compact CAD sidebars, a mode rail, and a prominent command line rather than a long startup checklist.
2. Type design intent, see payload, reach, cycle, material, constraint, or restriction chips, and start a prompt concept without any false generated-CAD claim.
3. Add reference images and confirm they are labeled as reference intake only.
4. Toggle the assembly between collapsed and exploded states, or scrub the explode slider from 0 to 100 percent.
5. Orbit the assembly with yaw buttons, the yaw slider, and the pitch slider.
6. Click a part in the visual assembly or the selectable part list.
7. See selected-part highlighting in the assembly and the same part in the inspector.
8. Read plain-English design criteria for the selected part, including intended load or lift role, material, stiffness and elasticity, heat or temperature limitation, manufacturing process, known versus estimated versus review-required values, and source confidence.
9. Open the selected-part and selected-assembly pre-solver readiness panels and confirm they show explicit load cases, constraints, material provenance, thermal guidance, expected FreeCAD, Gmsh, and CalculiX artifacts, and review-required notes. Assembly readiness should cover all included parts and omit unsupported aggregate estimates.
10. Confirm that seeded or heuristic values are labeled as demo estimates or seeded material guidance, and that missing or unsupported engineering values are marked review-required.
11. Select a compatible material/process option. Confirm the comparison shows current versus substitute material, weight delta, stiffness, yield, heat limit, cost range, lead-time range, and review-required confidence labels.
12. When connected to the FastAPI backend, click `Preview backend impact`. Confirm the BOM, manufacturing, readiness, and report panels switch into a preview state and the project is not persisted yet.
13. Click `Apply validated substitution` after a successful preview. Confirm the selected part, BOM range, manufacturing process, readiness material properties, and reports reload from persisted backend state. Incompatible choices should stay blocked with an understandable error instead of silently applying.
14. Use the `Portable project file` card in Reports mode to export the current project as a `.mfcad.json` file.
15. Use `Import project` to reopen that file. Confirm the project name, assembly, selected parts, wiring panel, analysis readiness panels, material substitution state, and analysis job artifacts still appear.
16. When connected to the FastAPI backend, click `Run pre-solver screening for ...` in Analysis mode. Confirm the new job appears with a review-required artifact titled `Local pre-solver screening package, not FEA`. Export and import again to confirm that result artifact reference is preserved.
17. Inspect the local solver readiness panel. Confirm it distinguishes selected-target pre-solver readiness, solver-unavailable tools, review-required full-stack project FEA, and any completed CalculiX fixture result.
18. Click `Run solver-readiness fixture for ...`. If CalculiX is absent, confirm the job returns `solver unavailable` with a generated `.inp` artifact manifest and install guidance. If CalculiX is installed, confirm the job says the fixture ran but is not project FEA.
19. Inspect the analysis job queue panel. Confirm each row shows its current status, local or cloud-planning recommendation, explanation, runtime and wait estimates, and cached report or artifact references where available. Confirm cloud recommendations are labeled planning-only and never offer execution.
20. Create or import a queued analysis job and confirm missing tools or review-required inputs remain blocked or unavailable in the queue. Confirm a local pre-solver job can expose its retained artifact metadata and that an expired or unavailable file is not presented as a current downloadable result.

No project FEA solver is running in this slice. The full FEA row remains review-required until FreeCAD geometry prep, Gmsh meshing, and CalculiX project solving workers are implemented. The readiness panel is pre-solver input only, the local pre-solver runner artifact is a pre-solver package, the CalculiX fixture proves executable solver plumbing only, and visible strength criteria are advisory demo seed data unless a future project solver artifact replaces them. Material substitution cost and lead-time values are ranged estimates from explicit seed manufacturing options, not exact supplier quotes.

## macOS Finder launcher

For a local double-click path on macOS, install a small `.command` launcher on your Desktop:

```sh
npm run desktop:macos:shortcut
```

Then double-click `MechaFlow CAD.command` in Finder. The launcher changes into this checkout, runs `npm ci` if `node_modules` is missing, and then runs `npm start`. Set `MECHAFLOW_DESKTOP_LAUNCHER` before the install command if you want to place it somewhere other than `~/Desktop`, quoting paths that contain spaces:

```sh
MECHAFLOW_DESKTOP_LAUNCHER="/path/to/MechaFlow CAD.command" npm run desktop:macos:shortcut
```

This is intentionally the smallest reliable desktop-openable path for the MVP. It is not a signed `.app` bundle yet, so Gatekeeper, signing, auto-update, and native installer polish should be handled in a later packaging slice.

## Save, share, and reopen a demo project

The desktop shell supports file import and export through the browser-native download and file input controls. With `npm start`, the Electron window uses the Node mock API, which supports the same MVP project file envelope for visual testing.

For the FastAPI backend path, start the backend and frontend as shown below. Then:

1. Inspect the robot arm assembly.
2. Run pre-solver screening for a selected part.
3. Click `Export project` and save `project-open-gripper-demo.mfcad.json`.
4. Click `Import project` and pick the saved file.
5. Verify the imported cockpit still shows the robot assembly, materials, wiring awareness, readiness details, analysis queue recommendation metadata, cached report or artifact references, and pre-solver artifact.

If a platform-specific file dialog blocks the demo, use the documented API commands in [Project files](project-files.md) to export and import the same JSON file.

## FastAPI pre-solver and solver-readiness demo

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
MECHAFLOW_API_HOST=127.0.0.1 MECHAFLOW_API_PORT=8123 mechaflow-api
```

In another terminal:

```sh
VITE_API_BASE_URL=http://127.0.0.1:8123 MECHAFLOW_FRONTEND_PORT=7332 npm run dev
```

Open the Vite URL and use the analysis panel buttons. You can also inspect the pre-solver path directly:

```sh
curl -s -X POST http://127.0.0.1:8123/api/projects/project-open-gripper-demo/analysis-jobs/pre-solver-runs \
  -H 'Content-Type: application/json' \
  -d '{"target_id":"part-finger-link"}' | python -m json.tool
```

If FreeCAD, Gmsh, or CalculiX are absent, the job still completes the pre-solver package and reports those tool boundaries as unavailable and review-required. It does not fail with an unclear solver error.

Inspect solver readiness and run the CalculiX fixture boundary:

```sh
curl -s http://127.0.0.1:8123/api/local-analysis/solver-readiness | python -m json.tool
curl -s -X POST http://127.0.0.1:8123/api/projects/project-open-gripper-demo/analysis-jobs/solver-readiness-runs \
  -H 'Content-Type: application/json' \
  -d '{"target_id":"part-finger-link"}' | python -m json.tool
```

If CalculiX is absent, the fixture endpoint returns `solver_unavailable` with a generated input deck manifest. If CalculiX is installed, it invokes a deterministic fixture and collects logs and output files, but that result is not project FEA.

## Checks

Run the desktop smoke check without opening a visible window:

```sh
npm run desktop:smoke
```

The smoke check allocates an explicit backend/frontend port pair, launches the mock API, Vite, and Electron shell, verifies the `MechaFlow CAD` app identity appears in the launcher output, and exits through Electron smoke mode.

Use the normal frontend checks for the React app loaded by the desktop shell:

```sh
npm test
npm run build
npm run smoke
```

Troubleshooting quick hits:

- Missing `vite` or `electron`: run `npm ci` again from the repository root.
- Busy configured port: choose another pair with `npm run ports:find`, then rerun with `MECHAFLOW_API_PORT` and `MECHAFLOW_FRONTEND_PORT`.
- Window opens but data is stale: quit the window and terminal process, then relaunch with `npm start` so the mock API reloads from the current seed data.
- Need persisted pre-solver jobs: use the FastAPI demo path above, because the one-command desktop path intentionally uses the Node mock API.

The existing browser and backend workflows remain available. See [Frontend development](frontend.md) and [Local development](local-development.md).
