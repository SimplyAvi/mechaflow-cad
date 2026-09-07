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

The mock API is enough to open the desktop cockpit, author visual primitives, route visible wiring, import/export `.mfcad.json`, inspect analysis-readiness data, and see solver-unavailable UI states. To persist and run the FastAPI local pre-solver runner or CalculiX solver-readiness fixture, start the Python backend instead, then launch the frontend with `VITE_API_BASE_URL` pointing at it.

You can pin ports when needed:

```sh
MECHAFLOW_API_PORT=7331 MECHAFLOW_FRONTEND_PORT=7332 npm start
```

If either configured port is already in use, startup fails before orchestration begins and names the busy port. Close the desktop window or press `Ctrl+C` in the terminal to stop the local API and frontend.

## Captain demo script

Use this path for a fresh captain test with no paid services and no privileged solver install:

1. Run `npm ci`, then `npm start` from the repo root.
2. In the `MechaFlow CAD` window, confirm the opening state is full-canvas visual-authoring first: the XYZ grid canvas dominates the page, the selected part has on-model annotations plus a viewport-anchored editor, and the full-canvas action bar can open Project, Part, Tools, Load, Drawing/FEA, Assembly, Command, or Review pop-outs. The project browser, primitive palette, command line, part inspector, and visible wiring controls should stay in contextual drawers until requested.
3. Type a design intent with payload, dimensions, timing, units, material, and restrictions, then confirm extracted chips appear. Click `Start design` and verify the app pre-fills editable visual geometry while labeling the result as a local prompt concept, not generated parametric CAD.
4. Add one or more reference photos or images by upload or drag/drop. Confirm the UI stores local reference metadata only and does not claim photo-to-CAD reconstruction.
5. Use the left browser to open an existing `.mfcad.json` project through the offline client path, local desktop mock, or backend, reopen the recent project, or load a repository-local ready example. Ready examples are MIT local seeds and do not import external CAD assets.
6. In Design mode, collapse or explode the robot arm, orbit with yaw and pitch, shift-drag to pan, zoom, then select a concrete arm part directly in the canvas or from the Project drawer model tree. The canvas annotations, viewport-anchored editor, and contextual Review drawer selected-part card should agree on the same actual part. The model canvas should show size, constraints/features, hole placement, fastener fit, material/process, and load/FEA context while the viewport editor shows editable dimensions, sketch plane/profile/extrude/cut controls, centered fastener hole placement, material/process controls, machinist drawing preview, and FEA-input preview without requiring a page scroll away from the model.
7. Use `Guided part studio` to describe an approximate sleeve, coupler, connector, or arm part. Confirm the sketch/profile, viewport dimensions, feature recipe, local catalog match, units, and assembly placement steps are visible. Apply the recipe to the selected part or place it as a new editable assembly part, then adjust a selected dimension from the viewport editor and confirm the rendered callout and drawing preview update.
8. Use Requirement sizing triage to confirm the 50 lb baseline accounts for payload plus assembly self-weight, reach, and safety factor. Click `Set demo target to 75 lb`, confirm undersized actuator torque, fasteners, joints or sleeves, links, brackets, and end-effector checks are highlighted, then apply one or all deterministic catalog-backed fixes while keeping the review-required labels visible.
9. Use `Focus selected` to inspect the matched geometry in isolation, then clear focus to restore the assembly context. Confirm the selected geometry lifts away, nearby parts dim, and dimensions remain readable.
10. Use the canvas CAD tool palette or lower primitive palette to create a beam, joint, bracket, motor, connector, electronics block, or tool plate. Rename it with the label field, edit dimensions and XYZ position, rotate it, pick a sketch plane/profile, set an extrude or cut operation, place a centered hole 2 in from the bottom using a selected screw/bolt size, connect it to a parent part, choose a joint type, and route a visible wire to another part. The canvas, selected-part card, model tree, visible joint marker, drawing preview, FEA-input preview, and visible wire list should update immediately.
11. Open the right-side `Design and material tools` disclosure, choose a compatible material or process option, and read the projected weight, stiffness, heat, cost, lead time, manufacturing, and wiring impacts. Use `Preview backend impact` before `Apply validated substitution`; preview is non-persisted and apply remains validated and review-required.
12. Switch to Manufacturing mode to review BOM, make or buy paths, wiring, and electronics. Cost and lead time are estimates, wiring checks are deterministic MVP heuristics, and exact electrical or CAD validation remains review-required.
13. Switch to Analysis mode to inspect selected target readiness, local solver tool availability, queued jobs, recommendations, runtime or cost estimates, cached artifacts, and reports. Cloud compute is planning-only. Full project FEA is unavailable until provider approvals and real worker tooling exist.
14. With the one-command desktop mock API or the FastAPI backend connected, run `Run pre-solver screening for ...`. The new job should say `not FEA` and produce a review-required package. Run the solver-readiness fixture if desired; without CalculiX it should produce input artifacts and a solver-unavailable state.
15. Switch to Reports mode or use the Design mode export button, verify cached report and artifact provenance, export `project-open-gripper-demo.mfcad.json`, import it again, and confirm selected assembly, units, authored parts, motor or connector placements, catalog recipe metadata, viewport sketch state, hole/fastener metadata, drawing/FEA preview extension, materials, visible wiring, analysis queue, cached evidence, and review-required labels survive the round trip.
16. Switch to Backend mode only when you need API handoff details.

A bundled import fixture is available at `data/captain-demo-project.mfcad.json`. It exercises the same integrated path: visual selection, material substitution, BOM and manufacturing, wiring and electronics, solver readiness, local job queue, cached artifact metadata, and project-file import/export.

Run the automated captain smoke before handing off evidence:

```sh
npm run captain:smoke
```

The smoke script launches the Electron desktop smoke path, imports the bundled captain fixture into the local mock API, previews a material substitution, runs local-safe analysis endpoints, confirms solver-unavailable boundaries, and exports the resulting `.mfcad.json` evidence package.

## What to test visually

The desktop demo centers on a robot arm visual MVP with a wrist gripper. The legacy local project id is still `project-open-gripper-demo` so the backend and smoke-test contracts stay compatible, but the bundled visual seed now shows a base, shoulder, upper arm, elbow, forearm, wrist plate, gripper jaw, and controller PCB. In the window, verify that you can:

1. Land on a calm visual CAD cockpit with compact sidebars, an XYZ grid canvas, a mode rail, a primitive palette, and a prominent command line rather than a long startup checklist.
2. Choose millimeters, centimeters, meters, or inches and confirm dimension labels update while the project remains exportable.
3. Type design intent, see payload, reach, cycle, material, constraint, or restriction chips, and start a prompt concept without any false generated-CAD claim.
4. Add reference images and confirm they are labeled as reference intake only.
5. Toggle the assembly between collapsed and exploded states, or scrub the explode slider from 0 to 100 percent.
6. Orbit the assembly with yaw buttons, the yaw slider, and the pitch slider. Shift-drag to pan and use wheel or the zoom slider to zoom.
7. Click a concrete part in the visual assembly or the selectable part list. Also keyboard-focus a canvas part and press Enter or Space.
8. See selected-part highlighting in the assembly, active state in the model tree, and the same part in the selected-part detail card anchored under the canvas and in the inspector.
9. Create a primitive from the palette, label it, edit its length, width, height or diameter, XYZ position, Z rotation, material, manufacturing process, sketch plane/profile, extrude/cut state, and fastener hole placement from the viewport editor, and verify it appears in the model tree.
10. Connect the selected part to a parent and change the joint type. Confirm the canvas shows a visible connection marker.
11. Route a wire between two parts. Confirm the cyan polyline, route list, wiring panel, and exported project data include the new harness route.
12. Read plain-English design criteria for the selected part near the canvas, including intended load or lift role, requirement sizing status, payload and reach thresholds, safety-factor guidance when seeded, stiffness and yield guidance, heat or temperature limitation, manufacturing process, viewport sketch operation, hole and fastener placement, load cases, constraints, wiring or serviceability criteria, known versus estimated versus review-required values, material rationale, and source confidence.
13. Change the requirement from 50 lb to 75 lb in Requirement sizing triage and confirm affected parts receive visible load highlights. Apply a deterministic fix and confirm the selected-part card records local upgrade catalog metadata without claiming FEA.
14. Open the selected-part and selected-assembly pre-solver readiness panels and confirm they show explicit load cases, constraints, material provenance, thermal guidance, expected FreeCAD, Gmsh, and CalculiX artifacts, and review-required notes. Assembly readiness should cover all included parts and omit unsupported aggregate estimates.
15. Confirm that seeded or heuristic values are labeled as demo estimates or seeded material guidance, and that missing or unsupported engineering values are marked review-required.
16. Select a compatible material/process option. Confirm the comparison shows current versus substitute material, weight delta, stiffness, yield, heat limit, cost range, lead-time range, and review-required confidence labels.
17. When connected to the FastAPI backend, click `Preview backend impact`. Confirm the BOM, manufacturing, readiness, and report panels switch into a preview state and the project is not persisted yet.
18. Click `Apply validated substitution` after a successful preview. Confirm the selected part, BOM range, manufacturing process, readiness material properties, and reports reload from persisted backend state. Incompatible choices should stay blocked with an understandable error instead of silently applying.
19. Use the `Portable project file` card in Reports mode or the Design mode export button to export the current project as a `.mfcad.json` file. Confirm the browser export includes the selected part drawing and FEA-input preview under the visual-authoring extension.
20. Use `Import project` to reopen that file. Confirm the project name, assembly, units, selected parts, authored primitives, wiring panel, analysis readiness panels, material substitution state, and analysis job artifacts still appear.
21. When connected to the FastAPI backend, click `Run pre-solver screening for ...` in Analysis mode. Confirm the new job appears with a review-required artifact titled `Local pre-solver screening package, not FEA`. Export and import again to confirm that result artifact reference is preserved.
22. Inspect the local solver readiness panel. Confirm it distinguishes selected-target pre-solver readiness, solver-unavailable tools, review-required full-stack project FEA, and any completed CalculiX fixture result.
23. Click `Run solver-readiness fixture for ...`. If CalculiX is absent, confirm the job returns `solver unavailable` with a generated `.inp` artifact manifest and install guidance. If CalculiX is installed, confirm the job says the fixture ran but is not project FEA.
24. Inspect the analysis job queue panel. Confirm each row shows its current status, local or cloud-planning recommendation, explanation, runtime and wait estimates, and cached report or artifact references where available. Confirm cloud recommendations are labeled planning-only and never offer execution.
25. Create or import a queued analysis job and confirm missing tools or review-required inputs remain blocked or unavailable in the queue. Confirm a local pre-solver job can expose its retained artifact metadata and that an expired or unavailable file is not presented as a current downloadable result.

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
2. Create or edit at least one visual primitive, set units, connect it to a parent, and route a visible wire if you are testing authoring persistence.
3. Run pre-solver screening for a selected part when the FastAPI backend is connected.
4. Click `Export project` and save `project-open-gripper-demo.mfcad.json`.
5. Click `Import project` and pick the saved file.
6. Verify the imported cockpit still shows the robot assembly, units, authored geometry metadata, materials, wiring awareness, readiness details, analysis queue recommendation metadata, cached report or artifact references, and pre-solver artifact.

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

The existing browser and backend workflows remain available. See [Frontend development](frontend.md), [Captain demo](captain-demo.md), and [Local development](local-development.md).
