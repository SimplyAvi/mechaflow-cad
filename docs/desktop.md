# Desktop demo

MechaFlow CAD now has a local desktop-openable path for the MVP cockpit. The first shell uses Electron because it opens from one npm command on the existing Vite and React stack without requiring a Rust toolchain or platform SDK setup. Tauri remains a good later packaging target when the team is ready to add Rust-based desktop builds.

## Install

Use Node.js matching the `engines.node` range in `package.json`, then install dependencies:

```sh
npm ci
```

## Open the desktop demo

Run one command from the repository root:

```sh
npm run desktop:dev
```

This command starts three local pieces:

- The Node mock API at a free local port.
- The Vite React cockpit at a free local port.
- An Electron desktop window titled `MechaFlow CAD local desktop demo` that loads the local cockpit URL.

The mock API is enough to open the desktop cockpit and inspect analysis-readiness data. To persist and run the new FastAPI local pre-solver runner, start the Python backend instead, then launch the frontend or desktop shell with `VITE_API_BASE_URL` pointing at it.

You can pin ports when needed:

```sh
MECHAFLOW_API_PORT=7331 MECHAFLOW_FRONTEND_PORT=7332 npm run desktop:dev
```

Close the desktop window or press `Ctrl+C` in the terminal to stop the local API and frontend.

## What to test visually

The desktop demo centers on a robot arm visual MVP with a wrist gripper. The legacy local project id is still `project-open-gripper-demo` so the backend and smoke-test contracts stay compatible, but the bundled visual seed now shows a base, shoulder, upper arm, elbow, forearm, wrist plate, gripper jaw, and controller PCB. In the window, verify that you can:

1. Toggle the assembly between collapsed and exploded states, or scrub the explode slider from 0 to 100 percent.
2. Orbit the assembly with yaw buttons, the yaw slider, and the pitch slider.
3. Click a part in the visual assembly or the selectable part list.
4. See selected-part highlighting in the assembly and the same part in the inspector.
5. Read plain-English design criteria for the selected part, including intended load or lift role, material, stiffness and elasticity, heat or temperature limitation, manufacturing process, known versus estimated versus review-required values, and source confidence.
6. Open the selected-part and selected-assembly pre-solver readiness panels and confirm they show explicit load cases, constraints, material provenance, thermal guidance, expected FreeCAD, Gmsh, and CalculiX artifacts, and review-required notes. Assembly readiness should cover all included parts and omit unsupported aggregate estimates.
7. Confirm that seeded or heuristic values are labeled as demo estimates or seeded material guidance, and that missing or unsupported engineering values are marked review-required.
8. Use the `Portable project file` card in the reference panel to export the current project as a `.mfcad.json` file.
9. Use `Import project` to reopen that file. Confirm the project name, assembly, selected parts, wiring panel, analysis readiness panels, and analysis job artifacts still appear.
10. When connected to the FastAPI backend, click `Run pre-solver screening for ...` in the analysis panel. Confirm the new job appears with a review-required artifact titled `Local pre-solver screening package, not FEA`. Export and import again to confirm that result artifact reference is preserved.

No real FEA solver is running in this slice. The FEA row is a blocked adapter handoff, the readiness panel is pre-solver input only, the local runner artifact is a pre-solver package, and the visible strength criteria are advisory demo seed data only. Later FEA integration should replace the load-capacity cards with solver artifacts such as stress, deflection, boundary conditions, mesh provenance, and solver logs.

## Save, share, and reopen a demo project

The desktop shell supports file import and export through the browser-native download and file input controls. With `npm run desktop:dev`, the Electron window uses the Node mock API, which supports the same MVP project file envelope for visual testing.

For the FastAPI backend path, start the backend and frontend as shown below. Then:

1. Inspect the robot arm assembly.
2. Run pre-solver screening for a selected part.
3. Click `Export project` and save `project-open-gripper-demo.mfcad.json`.
4. Click `Import project` and pick the saved file.
5. Verify the imported cockpit still shows the robot assembly, materials, wiring awareness, readiness details, and pre-solver artifact.

If a platform-specific file dialog blocks the demo, use the documented API commands in [Project files](project-files.md) to export and import the same JSON file.

## FastAPI pre-solver runner demo

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

Open the Vite URL and use the analysis panel button. You can also inspect the same path directly:

```sh
curl -s -X POST http://127.0.0.1:8123/api/projects/project-open-gripper-demo/analysis-jobs/pre-solver-runs \
  -H 'Content-Type: application/json' \
  -d '{"target_id":"part-finger-link"}' | python -m json.tool
```

If FreeCAD, Gmsh, or CalculiX are absent, the job still completes the pre-solver package and reports those tool boundaries as unavailable and review-required. It does not fail with an unclear solver error.

## Checks

Run the desktop smoke check without opening a window:

```sh
npm run desktop:smoke
```

Use the normal frontend checks for the React app loaded by the desktop shell:

```sh
npm test
npm run build
npm run smoke
```

The existing browser and backend workflows remain available. See [Frontend development](frontend.md) and [Local development](local-development.md).
