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

The desktop demo centers on the open gripper assembly seed. In the window, verify that you can:

1. Toggle the exploded view between collapsed and exploded states.
2. Rotate the assembly with the left and right buttons or the rotation slider.
3. Click a part in the visual assembly or the selectable part list.
4. Read plain-English design criteria for the selected part, including load capacity seed, stiffness, temperature limit, material strength, and manufacturing process.
5. Confirm that seeded or heuristic values are labeled as estimates, and that missing or unsupported engineering values are marked review-required.

No real FEA solver is running in this slice. The background FEA-related rows are adapter handoff stubs and advisory seed data only.

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
