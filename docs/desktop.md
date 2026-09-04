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
6. Open the selected-part pre-solver readiness panel and confirm it shows explicit load cases, constraints, material provenance, thermal guidance, expected FreeCAD, Gmsh, and CalculiX artifacts, and review-required notes.
7. Confirm that seeded or heuristic values are labeled as demo estimates or seeded material guidance, and that missing or unsupported engineering values are marked review-required.

No real FEA solver is running in this slice. The FEA row is a blocked adapter handoff, the readiness panel is pre-solver input only, and the visible strength criteria are advisory demo seed data only. Later FEA integration should replace the load-capacity cards with solver artifacts such as stress, deflection, boundary conditions, mesh provenance, and solver logs.

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
