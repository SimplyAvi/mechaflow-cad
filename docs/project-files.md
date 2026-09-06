# MVP project file format

MechaFlow CAD project files are portable JSON documents for the desktop and browser MVP. They are meant for save, load, and share workflows for the visual authoring workspace before real STEP or FreeCAD import workers are wired.

## File name and media type

Recommended extension: `.mfcad.json`

Recommended media type: `application/json`

## Version 1 envelope

```json
{
  "format": "mechaflow-cad.project",
  "schema_version": "1.0",
  "metadata": {
    "exported_at": "2026-09-05T00:00:00Z",
    "source_api_version": "0.1.0",
    "exported_by": "mechaflow-cad-api",
    "notes": []
  },
  "project": {},
  "analysis_readiness_previews": [],
  "extensions": {}
}
```

Fields:

- `format`: must be `mechaflow-cad.project`. Other formats, including raw STEP, FreeCAD, KiCad, and WireViz files, are rejected by this MVP importer.
- `schema_version`: must be `1.0`.
- `metadata`: export provenance for humans and tooling.
- `project`: the backend `Project` schema from `backend/mechaflow_api/models.py`. This is the authoritative persisted data.
- `analysis_readiness_previews`: portable preview records for desktop display and review. The backend can regenerate these from `project` after import.
- `extensions`: reserved object for future importer hints. MVP import validates the envelope and stores the project, but it does not invoke real CAD tools.

The project payload preserves the meaningful MVP data: authoring units, project metadata, visual-authoring metadata, assemblies, parts, dimensions, optional primitive diameter, materials, electronics components, wire segments, wiring rule sets, wiring routes, active task, modifications, analysis jobs, job recommendations, cached report references, cached artifact references, reports, and analysis job artifacts. BOM, manufacturing option groupings, wiring/electronics panels, route review evidence, analysis readiness panels, and enriched job queue panels are rebuilt from the imported project through `ProjectPanelData`.

Visual authoring data is stored on each part at `metadata.visual_authoring`. The browser workspace writes fields such as `primitive`, `position_mm`, `rotation_deg`, `color`, `parent_part_id`, `joint_type`, `assigned_to_part_id`, and `connector_id`; the in-place label editor persists its trimmed value as the part's canonical `name`. These fields drive the MVP canvas and are intentionally review-required hints until real CAD geometry workers produce authoritative artifacts.

## API

Export a project:

```sh
curl -s http://127.0.0.1:8123/api/projects/project-open-gripper-demo/export-file \
  -o project-open-gripper-demo.mfcad.json
```

Import or reopen a project file:

```sh
curl -s -X POST http://127.0.0.1:8123/api/projects/import-file \
  -H 'Content-Type: application/json' \
  --data-binary @project-open-gripper-demo.mfcad.json | python -m json.tool
```

The import endpoint validates and upserts the project id in the file. Use the optional `project_id` query string only when intentionally opening the file under another local id:

```sh
curl -s -X POST 'http://127.0.0.1:8123/api/projects/import-file?project_id=my-copy' \
  -H 'Content-Type: application/json' \
  --data-binary @project-open-gripper-demo.mfcad.json
```

If a copied project reuses analysis job ids that already belong to another local project, the backend returns `409` so artifacts are not ambiguously shared between projects.

## Validation errors

Malformed JSON returns `422` with a JSON parse detail from FastAPI.

Unsupported envelopes return `422`, for example when `format` is not `mechaflow-cad.project` or `schema_version` is not `1.0`.

Schema errors inside `project` also return `422` and do not overwrite the current in-memory project. Examples include duplicate part ids, unknown material references, invalid wiring endpoints, routes that reference missing wire segments or electronics components, non-finite numbers, unsupported units, unsupported analysis artifacts, cached artifact references that do not belong to the current job, and stale or impossible artifact download URLs.

## Future import hooks

Real CAD import is intentionally out of scope for this slice. Future workers can add extension records for:

- STEP or FreeCAD geometry source files.
- KiCad electronics documents.
- WireViz harness source.
- Solver artifact bundles from FreeCAD, Gmsh, and CalculiX.

Those workers should keep this JSON envelope as the portable project manifest and attach heavy files by path, content-addressed storage, or a package format rather than overloading the MVP schema. Heavy artifact files may expire according to local retention policy, so imported metadata must be treated as a cache reference until the artifact endpoint confirms the file still exists.
