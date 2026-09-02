# Frontend development

The first MechaFlow CAD frontend is a Vite, React, and TypeScript application. It is intentionally lightweight and uses local CSS so a formal design system can replace the visual layer later.

## What the cockpit demonstrates

The initial UI is useful before FreeCAD, KiCad, FEA, or supplier workers exist. It includes mocked orchestration data for:

- Opening an open reference robot gripper design.
- Viewing an animated exploded assembly concept.
- Selecting parts from the assembly and part tree.
- Preserving the active task while previewing material substitution.
- Re-rating payload capability and safety factor.
- Showing background CAD, FEA, wiring, and supplier job status.
- Reviewing BOM, cost, manufacturing, and lead-time panels.
- Surfacing wiring routes, bend radius, service loops, and clearance risk.

## Install

```sh
npm install
```

## Configurable ports

The captain runs multiple local projects, so choose ports explicitly when possible.

Frontend variables:

- `FRONTEND_PORT`: preferred frontend dev or preview port.
- `PORT`: fallback frontend port understood by many hosts.
- `FRONTEND_HOST`: host bind address, default `127.0.0.1`.

Mock backend variables:

- `BACKEND_PORT`: preferred mock API port.
- `API_PORT`: fallback mock API port.
- `BACKEND_HOST`: host bind address, default `127.0.0.1`.

Vite is configured with `strictPort: true`. If the selected frontend port is busy, startup fails clearly instead of silently moving to another port. Pick another port with `FRONTEND_PORT` or use the helper below.

Find currently unused local ports:

```sh
npm run ports:find
```

Example with explicit ports:

```sh
BACKEND_PORT=7331 FRONTEND_PORT=7332 npm run dev:full
```

If either port is busy, choose another pair:

```sh
PORT_COUNT=4 npm run ports:find
```

## Run only the frontend

The frontend can run without a backend by using bundled mock data:

```sh
FRONTEND_PORT=7332 npm run dev
```

Open the URL printed by Vite.

## Run frontend and mock backend together

Use the integrated local stack for frontend-to-backend development:

```sh
BACKEND_PORT=7331 FRONTEND_PORT=7332 npm run dev:full
```

This starts:

- Mock API at `http://127.0.0.1:$BACKEND_PORT`.
- Vite frontend at `http://127.0.0.1:$FRONTEND_PORT`.
- `VITE_API_BASE_URL` wired to the mock API.

You can also run both processes manually:

```sh
BACKEND_PORT=7331 npm run mock:api
VITE_API_BASE_URL=http://127.0.0.1:7331 FRONTEND_PORT=7332 npm run dev
```

## Checks and tests

Type-check and build:

```sh
npm run build
```

Unit and component tests:

```sh
npm test
```

End-to-end local smoke test:

```sh
npm run smoke
```

The smoke test chooses unused ports unless `BACKEND_PORT` and `FRONTEND_PORT` are set. It starts the mock backend, verifies `/health`, verifies the reference design API, builds the frontend with `VITE_API_BASE_URL`, starts Vite preview on the selected frontend port, and verifies the built app contains the configured API URL.

## Connecting to a real backend later

The frontend reads CAD orchestration data from:

```sh
VITE_API_BASE_URL=https://your-api.example
```

Expected early endpoint shape:

```text
GET /health
GET /api/reference-designs/:designId
```

`GET /api/reference-designs/:designId` should return the `ReferenceDesign` shape in `src/types.ts`. Until the backend is available, the app falls back to `src/data/mockDesign.ts` so frontend work is not blocked by FreeCAD or cloud compute integrations.
