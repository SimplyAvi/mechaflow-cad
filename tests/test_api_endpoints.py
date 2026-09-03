import json
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from threading import Barrier, local

from fastapi.testclient import TestClient

import mechaflow_api.main as main_module
from mechaflow_api.main import app
from mechaflow_api.models import AnalysisJobType, ManufacturingProcess
from mechaflow_api.storage import InMemoryProjectStore, build_sample_project


client = TestClient(app)
ROOT = Path(__file__).resolve().parents[1]


def test_health_and_status_endpoints() -> None:
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    status = client.get("/status")
    assert status.status_code == 200
    payload = status.json()
    assert payload["status"] == "degraded"
    assert {adapter["name"] for adapter in payload["adapters"]} >= {"freecad-worker", "calculix-fea-worker"}


def test_cors_defaults_to_local_vite_and_supports_configured_origins(monkeypatch) -> None:
    monkeypatch.delenv("MECHAFLOW_CORS_ORIGINS", raising=False)
    default_client = TestClient(main_module.create_app())

    allowed = default_client.get("/health", headers={"Origin": "http://127.0.0.1:5173"})
    foreign = default_client.get("/health", headers={"Origin": "https://foreign.example"})

    assert allowed.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert "access-control-allow-origin" not in foreign.headers

    monkeypatch.setenv("MECHAFLOW_CORS_ORIGINS", "http://127.0.0.1:7332,http://localhost:7332")
    configured_client = TestClient(main_module.create_app())
    configured = configured_client.get("/health", headers={"Origin": "http://localhost:7332"})

    assert configured.headers["access-control-allow-origin"] == "http://localhost:7332"


def test_status_is_ok_when_adapters_are_no_longer_stubs(monkeypatch) -> None:
    ready_adapters = [adapter.model_copy(update={"status": "ready"}) for adapter in main_module.list_adapter_statuses()]
    monkeypatch.setattr(main_module, "list_adapter_statuses", lambda: ready_adapters)
    ready_client = TestClient(main_module.create_app())

    assert ready_client.get("/status").json()["status"] == "ok"


def test_metadata_exposes_frontend_concepts_and_schema_names() -> None:
    metadata = client.get("/api/metadata")
    assert metadata.status_code == 200
    concepts = set(metadata.json()["concepts"])
    assert {
        "projects",
        "reference_designs",
        "assemblies",
        "parts",
        "materials",
        "task_requirements",
        "analysis_jobs",
        "manufacturing_options",
        "wiring_routes",
        "reports",
    }.issubset(concepts)

    schemas = client.get("/api/schemas")
    assert schemas.status_code == 200
    schema_payload = schemas.json()
    assert "Project" in schema_payload
    assert "ReferenceDesign" in schema_payload
    assert "AnalysisReport" in schema_payload


def test_catalog_and_sample_project_are_structured() -> None:
    designs = client.get("/api/reference-designs")
    assert designs.status_code == 200
    assert designs.json()[0]["example_tasks"][0]["kind"] == "lift_payload"

    catalog_designs = client.get("/api/catalog/reference-designs")
    assert catalog_designs.status_code == 200
    assert any(design["id"] == "gaiahand" for design in catalog_designs.json()["items"])
    assert any(design["id"] == "open-gripper-demo" for design in catalog_designs.json()["items"])

    catalog_tasks = client.get("/api/catalog/tasks")
    assert catalog_tasks.status_code == 200
    assert any(task["id"] == "lift-static-payload" for task in catalog_tasks.json()["items"])

    materials = client.get("/api/materials")
    assert materials.status_code == 200
    assert {material["id"] for material in materials.json()} >= {
        "mat-aluminum-6061-t6",
        "mat-carbon-fiber-nylon",
        "mat-low-carbon-steel",
    }

    tasks = client.get("/api/task-requirements/sample")
    assert tasks.status_code == 200
    assert tasks.json()[0]["kind"] == "lift_payload"

    seed = client.get("/api/catalog/seed")
    assert seed.status_code == 200
    seed_payload = seed.json()
    assert seed_payload["sample_project"]["id"] == "project-open-gripper-demo"
    assert seed_payload["task_requirements"][0]["safety_factor_min"] == 2.0

    project = client.get("/api/projects/sample")
    assert project.status_code == 200
    payload = project.json()
    assert payload["active_task"]["target_value"] == 50
    assert payload["assemblies"][0]["wiring_routes"][0]["bend_radius_min_mm"] == 12

    panel = client.get("/api/projects/sample/panel-data")
    assert panel.status_code == 200
    assert panel.json()["project"]["id"] == "project-open-gripper-demo"


def test_frontend_mock_projection_keeps_backend_handoff_identity() -> None:
    backend_panel = client.get("/api/projects/project-open-gripper-demo/panel-data").json()
    with (ROOT / "src" / "data" / "backendPanelData.json").open(encoding="utf-8") as handle:
        frontend_panel = json.load(handle)

    assert frontend_panel["project"]["id"] == backend_panel["project"]["id"]
    assert frontend_panel["project"]["reference_design_id"] == backend_panel["project"]["reference_design_id"]
    assert frontend_panel["project"]["active_task"]["id"] == backend_panel["project"]["active_task"]["id"]
    backend_part_ids = {
        part["id"]
        for assembly in backend_panel["project"]["assemblies"]
        for part in assembly["parts"]
    }
    frontend_part_ids = {
        part["id"]
        for assembly in frontend_panel["project"]["assemblies"]
        for part in assembly["parts"]
    }
    assert {"part-finger-link", "part-palm-plate", "part-controller-pcb"} <= backend_part_ids
    assert {"part-finger-link", "part-palm-plate", "part-controller-pcb"} <= frontend_part_ids
    assert frontend_panel["project"]["name"]
    assert backend_panel["project"]["name"]


def test_project_panel_endpoints_expose_frontend_handoff_data() -> None:
    sample = client.get("/api/projects/sample").json()
    sample["id"] = "project-panel-flow"
    sample["analysis_jobs"] = []
    sample["reports"] = []
    client.put("/api/projects/project-panel-flow", json=sample)

    panel = client.get("/api/projects/project-panel-flow/panel-data")
    assert panel.status_code == 200
    panel_payload = panel.json()
    assert panel_payload["task_requirements"][0]["kind"] == "lift_payload"
    assert panel_payload["bom_items"][0]["part_id"] == "part-finger-link"
    assert panel_payload["manufacturing_options"][0]["options"][0]["process"] == "cnc_machining"
    assert panel_payload["wiring_routes"][0]["id"] == "route-finger-sensor"
    assert panel_payload["reports"] == []

    assert client.get("/api/projects/project-panel-flow/task-requirements").json()[0]["unit"] == "lb"
    assert client.get("/api/projects/project-panel-flow/bom").json()[0]["unit"] == "part"
    assert client.get("/api/projects/project-panel-flow/manufacturing-options").json()[0]["part_name"] == "Finger link"
    assert client.get("/api/projects/project-panel-flow/wiring-routes").json()[0]["clearance_min_mm"] == 2
    assert client.get("/api/projects/project-panel-flow/reports").json() == []


def test_project_panel_endpoints_expose_frontend_handoff_data() -> None:
    sample = client.get("/api/projects/sample").json()
    sample["id"] = "project-panel-flow"
    client.put("/api/projects/project-panel-flow", json=sample)

    panel = client.get("/api/projects/project-panel-flow/panel-data")
    assert panel.status_code == 200
    panel_payload = panel.json()
    assert panel_payload["task_requirements"][0]["kind"] == "lift_payload"
    assert panel_payload["bom_items"][0]["part_id"] == "part-finger-link"
    assert panel_payload["manufacturing_options"][0]["options"][0]["process"] == "cnc_machining"
    assert panel_payload["wiring_routes"][0]["id"] == "route-finger-sensor"
    assert panel_payload["reports"] == []

    assert client.get("/api/projects/project-panel-flow/task-requirements").json()[0]["unit"] == "lb"
    assert client.get("/api/projects/project-panel-flow/bom").json()[0]["unit"] == "part"
    assert client.get("/api/projects/project-panel-flow/manufacturing-options").json()[0]["part_name"] == "Finger link"
    assert client.get("/api/projects/project-panel-flow/wiring-routes").json()[0]["clearance_min_mm"] == 2
    assert client.get("/api/projects/project-panel-flow/reports").json() == []


def test_project_endpoints_store_and_return_local_projects() -> None:
    sample = client.get("/api/projects/sample").json()
    sample["id"] = "project-test"
    sample["name"] = "Schema validation project"
    for job in sample["analysis_jobs"]:
        job["id"] = f"{job['id']}-project-test"

    response = client.post("/api/projects", json=sample)

    assert response.status_code == 201
    assert response.json()["id"] == "project-test"
    assert {job["project_id"] for job in response.json()["analysis_jobs"]} == {"project-test"}
    assert all(
        artifact["job_id"] == job["id"]
        for job in response.json()["analysis_jobs"]
        for artifact in job["artifacts"]
    )
    assert {report["project_id"] for report in response.json()["reports"]} == {"project-test"}

    duplicate = client.post("/api/projects", json=sample)
    assert duplicate.status_code == 409

    listed = client.get("/api/projects")
    assert listed.status_code == 200
    assert {project["id"] for project in listed.json()} >= {"project-open-gripper-demo", "project-test"}

    fetched = client.get("/api/projects/project-test")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "Schema validation project"

    sample["id"] = "ignored-client-id"
    sample["name"] = "Updated local project"
    updated = client.put("/api/projects/project-test", json=sample)
    assert updated.status_code == 200
    assert updated.json()["id"] == "project-test"
    assert updated.json()["name"] == "Updated local project"
    assert {job["project_id"] for job in updated.json()["analysis_jobs"]} == {"project-test"}
    assert all(
        artifact["job_id"] == job["id"]
        for job in updated.json()["analysis_jobs"]
        for artifact in job["artifacts"]
    )
    assert {report["project_id"] for report in updated.json()["reports"]} == {"project-test"}


def test_project_writes_reject_unknown_fields_without_erasing_state() -> None:
    local_client = TestClient(main_module.create_app())
    original = local_client.get("/api/projects/sample").json()
    project_id = original["id"]
    misspelled_project = deepcopy(original)
    misspelled_project["assemblie"] = misspelled_project.pop("assemblies")

    project_response = local_client.put(f"/api/projects/{project_id}", json=misspelled_project)

    assert project_response.status_code == 422
    assert local_client.get(f"/api/projects/{project_id}").json() == original

    misspelled_part = deepcopy(original)
    misspelled_part["assemblies"][0]["parts"][0]["purpoze"] = "Misspelled nested field"

    part_response = local_client.put(f"/api/projects/{project_id}", json=misspelled_part)

    assert part_response.status_code == 422
    assert local_client.get(f"/api/projects/{project_id}").json() == original


def test_project_rejects_duplicate_part_ids_across_assemblies() -> None:
    local_client = TestClient(main_module.create_app())
    project = local_client.get("/api/projects/sample").json()
    project["id"] = "project-duplicate-parts"
    project["analysis_jobs"] = []
    project["reports"] = []
    duplicate_assembly = deepcopy(project["assemblies"][0])
    duplicate_assembly["id"] = "assembly-duplicate-parts"
    project["assemblies"].append(duplicate_assembly)

    response = local_client.post("/api/projects", json=project)

    assert response.status_code == 422
    assert local_client.get("/api/projects/project-duplicate-parts").status_code == 404


def test_project_rejects_duplicate_assembly_and_wiring_route_ids() -> None:
    local_client = TestClient(main_module.create_app())
    sample = local_client.get("/api/projects/sample").json()
    sample["analysis_jobs"] = []
    sample["reports"] = []

    duplicate_assembly = deepcopy(sample)
    duplicate_assembly["id"] = "project-duplicate-assemblies"
    second_assembly = deepcopy(duplicate_assembly["assemblies"][0])
    second_assembly["parts"] = []
    second_assembly["wiring_routes"] = []
    duplicate_assembly["assemblies"].append(second_assembly)
    assert local_client.post("/api/projects", json=duplicate_assembly).status_code == 422

    duplicate_route = deepcopy(sample)
    duplicate_route["id"] = "project-duplicate-routes"
    second_assembly = deepcopy(duplicate_route["assemblies"][0])
    second_assembly["id"] = "assembly-duplicate-route"
    second_assembly["parts"] = []
    second_assembly["wiring_routes"] = [deepcopy(second_assembly["wiring_routes"][0])]
    duplicate_route["assemblies"].append(second_assembly)
    assert local_client.post("/api/projects", json=duplicate_route).status_code == 422


def test_project_derives_part_wiring_routes_from_connector_endpoints() -> None:
    local_client = TestClient(main_module.create_app())
    project = local_client.get("/api/projects/sample").json()
    project["id"] = "project-endpoint-wiring"
    project["analysis_jobs"] = []
    project["reports"] = []
    finger = next(
        part
        for assembly in project["assemblies"]
        for part in assembly["parts"]
        if part["id"] == "part-finger-link"
    )
    actuator_bracket = next(
        part
        for assembly in project["assemblies"]
        for part in assembly["parts"]
        if part["id"] == "part-actuator-bracket"
    )
    finger["wiring_route_ids"] = []
    actuator_bracket["wiring_route_ids"] = ["route-main-harness"]

    created = local_client.post("/api/projects", json=project)

    assert created.status_code == 201
    created_finger = next(
        part
        for assembly in created.json()["assemblies"]
        for part in assembly["parts"]
        if part["id"] == "part-finger-link"
    )
    assert created_finger["wiring_route_ids"] == ["route-finger-sensor"]
    created_actuator_bracket = next(
        part
        for assembly in created.json()["assemblies"]
        for part in assembly["parts"]
        if part["id"] == "part-actuator-bracket"
    )
    assert created_actuator_bracket["wiring_route_ids"] == []

    response = local_client.post(
        "/api/projects/project-endpoint-wiring/modifications",
        json={
            "id": "mod-endpoint-wiring",
            "target_part_id": "part-finger-link",
            "description": "Increase finger thickness while retaining endpoint-linked wiring.",
            "dimension_changes": {"thickness_mm": 7},
        },
    )

    assert response.status_code == 200
    assert response.json()["report"]["wiring_impacts"] == [
        "Target part has wiring routes; clearance and bend radius need a worker check."
    ]


def test_project_rejects_wiring_endpoints_for_unknown_parts() -> None:
    local_client = TestClient(main_module.create_app())
    project = local_client.get("/api/projects/sample").json()
    project["id"] = "project-unknown-wiring-endpoint"
    project["analysis_jobs"] = []
    project["reports"] = []
    project["assemblies"][0]["wiring_routes"][0]["to_connector"]["part_id"] = "part-typo"

    response = local_client.post("/api/projects", json=project)

    assert response.status_code == 422
    assert "references unknown part 'part-typo'" in response.json()["detail"]
    assert local_client.get("/api/projects/project-unknown-wiring-endpoint").status_code == 404


def test_project_rejects_parts_with_unknown_materials() -> None:
    local_client = TestClient(main_module.create_app())
    project = local_client.get("/api/projects/sample").json()
    project["id"] = "project-unknown-part-material"
    project["analysis_jobs"] = []
    project["reports"] = []
    project["assemblies"][0]["parts"][0]["material_id"] = "mat-typo"

    response = local_client.post("/api/projects", json=project)

    assert response.status_code == 422
    assert "references unknown project material 'mat-typo'" in response.json()["detail"]
    assert local_client.get("/api/projects/project-unknown-part-material").status_code == 404


def test_project_rejects_invalid_ids_and_duplicate_material_ids() -> None:
    local_client = TestClient(main_module.create_app())
    sample = local_client.get("/api/projects/sample").json()
    sample["analysis_jobs"] = []
    sample["reports"] = []

    for project_id in ("team/a", "project with spaces", "sample", ".", ".."):
        invalid = deepcopy(sample)
        invalid["id"] = project_id
        assert local_client.post("/api/projects", json=invalid).status_code == 422

    path_authoritative = deepcopy(sample)
    path_authoritative["id"] = "project-valid-body-id"
    assert local_client.put("/api/projects/sample", json=path_authoritative).status_code == 422

    duplicate_materials = deepcopy(sample)
    duplicate_materials["id"] = "project-duplicate-materials"
    duplicate_materials["materials"].append(deepcopy(duplicate_materials["materials"][0]))
    assert local_client.post("/api/projects", json=duplicate_materials).status_code == 422


def test_project_write_rejects_nonfinite_part_dimensions() -> None:
    local_client = TestClient(main_module.create_app())
    project = local_client.get("/api/projects/sample").json()
    project["id"] = "project-nonfinite-dimensions"
    project["analysis_jobs"] = []
    project["reports"] = []
    project["assemblies"][0]["parts"][0]["dimensions"]["thickness_mm"] = 98765.4321
    request_body = json.dumps(project).replace("98765.4321", "1e309", 1)

    response = local_client.post(
        "/api/projects",
        content=request_body,
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 422
    assert local_client.get("/api/projects/project-nonfinite-dimensions").status_code == 404


def test_storage_rejects_nonfinite_project_and_job_values() -> None:
    local_client = TestClient(main_module.create_app())
    project = local_client.get("/api/projects/sample").json()
    project["id"] = "project-nonfinite-mass"
    project["analysis_jobs"] = []
    project["reports"] = []
    project["assemblies"][0]["parts"][0]["mass_kg"] = 98765.4321
    project_body = json.dumps(project).replace("98765.4321", "1e309", 1)

    project_response = local_client.post(
        "/api/projects",
        content=project_body,
        headers={"content-type": "application/json"},
    )

    assert project_response.status_code == 422
    assert local_client.get("/api/projects/project-nonfinite-mass").status_code == 404

    existing_job_ids = {job["id"] for job in local_client.get("/api/analysis-jobs").json()}
    job_response = local_client.post(
        "/api/analysis-jobs",
        content=(
            '{"job_type":"run_fea","target_id":"part-finger-link",'
            '"project_id":"project-open-gripper-demo","input_summary":{"load":1e309}}'
        ),
        headers={"content-type": "application/json"},
    )

    assert job_response.status_code == 422
    assert {job["id"] for job in local_client.get("/api/analysis-jobs").json()} == existing_job_ids


def test_project_modification_endpoint_updates_part_and_returns_report() -> None:
    sample = client.get("/api/projects/sample").json()
    sample["id"] = "project-modification-flow"
    sample["analysis_jobs"] = []
    sample["reports"] = []
    client.put("/api/projects/project-modification-flow", json=sample)

    response = client.post(
        "/api/projects/project-modification-flow/modifications",
        json={
            "id": "mod-finger-material-thickness",
            "target_part_id": "part-finger-link",
            "description": "Switch finger link to printed composite and thicken it for prototype review.",
            "material_id": "mat-carbon-fiber-nylon",
            "dimension_changes": {"thickness_mm": 8},
            "manufacturing_process": ManufacturingProcess.additive_fdm.value,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    edited_part = payload["project"]["assemblies"][0]["parts"][0]
    assert edited_part["material_id"] == "mat-carbon-fiber-nylon"
    assert edited_part["dimensions"]["thickness_mm"] == 8
    assert edited_part["mass_kg"] is None
    assert edited_part["metadata"]["preferred_manufacturing_process"] == "additive_fdm"
    assert payload["report"]["status"] == "requires_review"
    assert payload["report"]["task_results"][0]["status"] == "requires_review"

    stored = client.get("/api/projects/project-modification-flow").json()
    stored_part = next(
        part
        for assembly in stored["assemblies"]
        for part in assembly["parts"]
        if part["id"] == "part-finger-link"
    )
    assert stored_part["mass_kg"] is None
    assert stored["modifications"][0]["id"] == "mod-finger-material-thickness"
    assert stored["reports"][0]["id"] == payload["report"]["id"]


def test_idempotent_material_and_dimension_edits_preserve_mass() -> None:
    local_client = TestClient(main_module.create_app())
    project = local_client.get("/api/projects/sample").json()
    finger = next(
        part
        for assembly in project["assemblies"]
        for part in assembly["parts"]
        if part["id"] == "part-finger-link"
    )

    response = local_client.post(
        "/api/projects/project-open-gripper-demo/modifications",
        json={
            "id": "mod-idempotent-finger",
            "target_part_id": finger["id"],
            "description": "Resubmit the current finger material and thickness.",
            "material_id": finger["material_id"],
            "dimension_changes": {"thickness_mm": finger["dimensions"]["thickness_mm"]},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    edited_finger = next(
        part
        for assembly in payload["project"]["assemblies"]
        for part in assembly["parts"]
        if part["id"] == finger["id"]
    )
    assert edited_finger["mass_kg"] == finger["mass_kg"]
    assert payload["report"]["task_results"][0]["notes"] == [
        "Material unchanged.",
        "No dimensions changed.",
        "Manufacturing process unchanged.",
    ]
    assert not any("mass properties" in item.lower() for item in payload["report"]["unknowns"])
    assert not any("mass properties" in item.lower() for item in payload["report"]["recommendations"])


def test_project_modification_rejects_unknown_material_and_dimension() -> None:
    sample = client.get("/api/projects/sample").json()
    sample["id"] = "project-invalid-modification-flow"
    sample["analysis_jobs"] = []
    client.put("/api/projects/project-invalid-modification-flow", json=sample)

    bad_material = client.post(
        "/api/projects/project-invalid-modification-flow/modifications",
        json={
            "id": "mod-bad-material",
            "target_part_id": "part-finger-link",
            "description": "Use unknown material.",
            "material_id": "mat-does-not-exist",
        },
    )
    assert bad_material.status_code == 422

    blank_material = client.post(
        "/api/projects/project-invalid-modification-flow/modifications",
        json={
            "id": "mod-blank-material",
            "target_part_id": "part-finger-link",
            "description": "Reject blank material id.",
            "material_id": "",
        },
    )
    assert blank_material.status_code == 422

    bad_dimension = client.post(
        "/api/projects/project-invalid-modification-flow/modifications",
        json={
            "id": "mod-bad-dimension",
            "target_part_id": "part-finger-link",
            "description": "Use unsupported dimension key.",
            "dimension_changes": {"diameter_mm": 10},
        },
    )
    assert bad_dimension.status_code == 422

    misspelled_dimension = client.post(
        "/api/projects/project-invalid-modification-flow/modifications",
        json={
            "id": "mod-misspelled-dimension",
            "target_part_id": "part-finger-link",
            "description": "Reject a misspelled dimension field.",
            "dimension_change": {"thickness_mm": 10},
        },
    )
    assert misspelled_dimension.status_code == 422

    original = client.get("/api/projects/project-invalid-modification-flow").json()
    original_thickness = original["assemblies"][0]["parts"][0]["dimensions"]["thickness_mm"]
    nonfinite_dimension = client.post(
        "/api/projects/project-invalid-modification-flow/modifications",
        content=(
            '{"id":"mod-infinite-dimension","target_part_id":"part-finger-link",'
            '"description":"Reject a non-finite dimension.",'
            '"dimension_changes":{"thickness_mm":1e309}}'
        ),
        headers={"content-type": "application/json"},
    )
    assert nonfinite_dimension.status_code == 422
    stored = client.get("/api/projects/project-invalid-modification-flow").json()
    assert stored["assemblies"][0]["parts"][0]["dimensions"]["thickness_mm"] == original_thickness


def test_project_modification_enforces_part_material_process_compatibility() -> None:
    local_client = TestClient(main_module.create_app())
    sample = local_client.get("/api/projects/sample").json()
    sample["id"] = "project-compatibility-flow"
    sample["analysis_jobs"] = []
    sample["reports"] = []
    assert local_client.put("/api/projects/project-compatibility-flow", json=sample).status_code == 200

    incompatible = local_client.post(
        "/api/projects/project-compatibility-flow/modifications",
        json={
            "id": "mod-controller-aluminum",
            "target_part_id": "part-controller-pcb",
            "description": "Attempt to machine the controller from aluminum.",
            "material_id": "mat-aluminum-6061-t6",
            "manufacturing_process": ManufacturingProcess.cnc_machining.value,
        },
    )

    assert incompatible.status_code == 422
    stored = local_client.get("/api/projects/project-compatibility-flow").json()
    controller = next(
        part
        for assembly in stored["assemblies"]
        for part in assembly["parts"]
        if part["id"] == "part-controller-pcb"
    )
    assert controller["material_id"] == "mat-fr4-generic"


def test_material_only_change_rejects_incompatible_retained_process() -> None:
    local_client = TestClient(main_module.create_app())
    sample = local_client.get("/api/projects/sample").json()
    sample["id"] = "project-effective-process-flow"
    sample["analysis_jobs"] = []
    sample["reports"] = []
    assert local_client.put("/api/projects/project-effective-process-flow", json=sample).status_code == 200

    first = local_client.post(
        "/api/projects/project-effective-process-flow/modifications",
        json={
            "id": "mod-finger-composite",
            "target_part_id": "part-finger-link",
            "description": "Print the finger from composite.",
            "material_id": "mat-carbon-fiber-nylon",
            "manufacturing_process": ManufacturingProcess.additive_fdm.value,
        },
    )
    assert first.status_code == 200

    incompatible = local_client.post(
        "/api/projects/project-effective-process-flow/modifications",
        json={
            "id": "mod-finger-aluminum",
            "target_part_id": "part-finger-link",
            "description": "Return to aluminum without changing the retained process.",
            "material_id": "mat-aluminum-6061-t6",
        },
    )

    assert incompatible.status_code == 422
    stored = local_client.get("/api/projects/project-effective-process-flow").json()
    finger = next(
        part
        for assembly in stored["assemblies"]
        for part in assembly["parts"]
        if part["id"] == "part-finger-link"
    )
    assert finger["material_id"] == "mat-carbon-fiber-nylon"
    assert finger["metadata"]["preferred_manufacturing_process"] == "additive_fdm"


def test_project_modification_requires_explicit_compatibility_data() -> None:
    local_client = TestClient(main_module.create_app())
    sample = local_client.get("/api/projects/sample").json()
    sample["id"] = "project-compatibility-review"
    sample["analysis_jobs"] = []
    sample["reports"] = []
    finger = next(
        part
        for assembly in sample["assemblies"]
        for part in assembly["parts"]
        if part["id"] == "part-finger-link"
    )
    finger["manufacturing_options"] = []
    assert local_client.put("/api/projects/project-compatibility-review", json=sample).status_code == 200

    response = local_client.post(
        "/api/projects/project-compatibility-review/modifications",
        json={
            "id": "mod-missing-compatibility",
            "target_part_id": "part-finger-link",
            "description": "Require review when compatibility metadata is missing.",
            "material_id": "mat-carbon-fiber-nylon",
            "manufacturing_process": ManufacturingProcess.additive_fdm.value,
        },
    )

    assert response.status_code == 422
    assert "requires review" in response.json()["detail"]


def test_create_analysis_job_selects_matching_stub_adapter() -> None:
    response = client.post(
        "/api/analysis-jobs",
        json={
            "job_type": AnalysisJobType.run_fea.value,
            "target_id": "part-finger-link",
            "project_id": "project-open-gripper-demo",
        },
    )

    assert response.status_code == 202
    payload = response.json()
    assert payload["status"] == "queued"
    assert payload["adapter_name"] == "calculix-fea-worker"
    assert payload["result_summary"]["message"].startswith("Job accepted")
    assert payload["result_summary"]["queue_name"] == "fea-local"

    panel_jobs = client.get("/api/projects/project-open-gripper-demo/panel-data").json()["project"]["analysis_jobs"]
    assert any(job["id"] == payload["id"] for job in panel_jobs)


def test_concurrent_analysis_job_creates_do_not_lose_accepted_jobs() -> None:
    class CoordinatedProjectStore(InMemoryProjectStore):
        def __init__(self) -> None:
            super().__init__(seed_projects=[build_sample_project()])
            self._request_reads = local()
            self._second_read_barrier = Barrier(2)

        def get_project(self, project_id: str):
            project = super().get_project(project_id)
            if project_id != "project-open-gripper-demo":
                return project
            read_count = getattr(self._request_reads, "count", 0) + 1
            self._request_reads.count = read_count
            if read_count == 2:
                self._second_read_barrier.wait(timeout=2)
            return project

    concurrent_app = main_module.create_app(project_store=CoordinatedProjectStore())

    def create_job(target_id: str):
        with TestClient(concurrent_app) as concurrent_client:
            return concurrent_client.post(
                "/api/analysis-jobs",
                json={
                    "job_type": AnalysisJobType.run_fea.value,
                    "target_id": target_id,
                    "project_id": "project-open-gripper-demo",
                },
            )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(create_job, ["part-finger-link", "part-palm-plate"]))

    assert [response.status_code for response in responses] == [202, 202]
    created_ids = {response.json()["id"] for response in responses}
    with TestClient(concurrent_app) as concurrent_client:
        stored_jobs = concurrent_client.get(
            "/api/analysis-jobs",
            params={"project_id": "project-open-gripper-demo"},
        ).json()
    assert created_ids.issubset({job["id"] for job in stored_jobs})


def test_analysis_job_requires_an_existing_project() -> None:
    local_client = TestClient(main_module.create_app())

    missing_owner = local_client.post(
        "/api/analysis-jobs",
        json={
            "job_type": AnalysisJobType.extract_part_list.value,
            "target_id": "assembly-without-owner",
        },
    )

    response = local_client.post(
        "/api/analysis-jobs",
        json={
            "job_type": AnalysisJobType.extract_part_list.value,
            "target_id": "assembly-later",
            "project_id": "project-later",
        },
    )

    assert missing_owner.status_code == 422
    assert response.status_code == 404
    assert local_client.get("/api/analysis-jobs", params={"project_id": "project-later"}).json() == []


def test_analysis_job_ids_have_one_global_project_owner() -> None:
    local_client = TestClient(main_module.create_app())
    job = local_client.get("/api/projects/sample").json()["analysis_jobs"][0]
    job["id"] = "job-shared-client-id"
    job["artifacts"] = []

    first = local_client.post(
        "/api/projects",
        json={"id": "project-first-owner", "name": "First owner", "analysis_jobs": [job]},
    )
    second = local_client.post(
        "/api/projects",
        json={"id": "project-second-owner", "name": "Second owner", "analysis_jobs": [job]},
    )

    assert first.status_code == 201
    assert second.status_code == 409
    listed = local_client.get("/api/analysis-jobs/job-shared-client-id").json()
    assert listed["project_id"] == "project-first-owner"


def test_panel_data_deduplicates_a_roundtripped_runtime_job() -> None:
    local_client = TestClient(main_module.create_app())
    sample = local_client.get("/api/projects/sample").json()
    sample["id"] = "project-job-roundtrip"
    sample["analysis_jobs"] = []
    sample["reports"] = []
    local_client.put("/api/projects/project-job-roundtrip", json=sample)
    job = local_client.post(
        "/api/analysis-jobs",
        json={
            "job_type": AnalysisJobType.run_fea.value,
            "target_id": "part-finger-link",
            "project_id": "project-job-roundtrip",
        },
    ).json()

    first_panel = local_client.get("/api/projects/project-job-roundtrip/panel-data").json()
    local_client.put("/api/projects/project-job-roundtrip", json=first_panel["project"])
    second_panel = local_client.get("/api/projects/project-job-roundtrip/panel-data").json()

    assert [item["id"] for item in second_panel["project"]["analysis_jobs"]].count(job["id"]) == 1


def test_project_updates_are_the_effective_owner_of_job_state() -> None:
    local_client = TestClient(main_module.create_app())
    project = local_client.get("/api/projects/sample").json()
    for job in project["analysis_jobs"]:
        if job["id"] == "job-rerate-payload":
            job["status"] = "failed"

    updated = local_client.put(f"/api/projects/{project['id']}", json=project)
    assert updated.status_code == 200

    stored_job = next(
        job
        for job in local_client.get(f"/api/projects/{project['id']}").json()["analysis_jobs"]
        if job["id"] == "job-rerate-payload"
    )
    panel_job = next(
        job
        for job in local_client.get(f"/api/projects/{project['id']}/panel-data").json()["project"]["analysis_jobs"]
        if job["id"] == "job-rerate-payload"
    )
    listed_job = next(
        job
        for job in local_client.get("/api/analysis-jobs", params={"project_id": project["id"]}).json()
        if job["id"] == "job-rerate-payload"
    )

    assert {stored_job["status"], panel_job["status"], listed_job["status"]} == {"failed"}
    completed = local_client.post("/api/analysis-jobs/job-rerate-payload/run-stub")
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"
    refreshed = local_client.get(f"/api/projects/{project['id']}").json()
    assert next(job for job in refreshed["analysis_jobs"] if job["id"] == "job-rerate-payload")["status"] == "completed"


def test_overlapping_job_types_have_explicit_adapter_owners() -> None:
    expected_adapters = {
        AnalysisJobType.quick_load_heuristic: "calculix-fea-worker",
        AnalysisJobType.check_wire_routing: "wireviz-harness-worker",
        AnalysisJobType.generate_bom: "supplier-options-worker",
    }

    for job_type, adapter_name in expected_adapters.items():
        response = client.post(
            "/api/analysis-jobs",
            json={
                "job_type": job_type.value,
                "target_id": "project-open-gripper-demo",
                "project_id": "project-open-gripper-demo",
            },
        )
        assert response.status_code == 202
        assert response.json()["adapter_name"] == adapter_name


def test_persisted_adapter_owner_controls_job_planning_and_execution() -> None:
    local_client = TestClient(main_module.create_app())
    project = local_client.get("/api/projects/sample").json()
    project["id"] = "project-persisted-adapter"
    wire_job = next(job for job in project["analysis_jobs"] if job["job_type"] == "check_wire_routing")
    project["analysis_jobs"] = [wire_job]
    project["reports"] = []
    wire_job["id"] = "job-persisted-kicad"
    wire_job["adapter_name"] = "kicad-electronics-worker"
    wire_job["artifacts"] = []

    assert local_client.post("/api/projects", json=project).status_code == 201
    plan = local_client.get("/api/analysis-jobs/job-persisted-kicad/plan")
    completed = local_client.post("/api/analysis-jobs/job-persisted-kicad/run-stub")

    assert plan.status_code == 200
    assert plan.json()["adapter_name"] == "kicad-electronics-worker"
    assert plan.json()["queue_name"] == "electronics-local"
    assert completed.status_code == 200
    assert completed.json()["adapter_name"] == "kicad-electronics-worker"
    assert completed.json()["artifacts"][-1]["generated_by"] == "kicad-electronics-worker"

    invalid_project = deepcopy(project)
    invalid_project["id"] = "project-invalid-adapter-owner"
    invalid_project["analysis_jobs"][0]["id"] = "job-invalid-adapter-owner"
    invalid_project["analysis_jobs"][0]["job_type"] = AnalysisJobType.run_fea.value
    rejected = local_client.post("/api/projects", json=invalid_project)

    assert rejected.status_code == 422
    assert local_client.get("/api/projects/project-invalid-adapter-owner").status_code == 404


def test_persisted_job_artifacts_must_match_their_job_type() -> None:
    local_client = TestClient(main_module.create_app())
    project = local_client.get("/api/projects/sample").json()
    project["id"] = "project-invalid-artifact-kind"
    project["reports"] = []
    project["analysis_jobs"] = [project["analysis_jobs"][0]]
    job = project["analysis_jobs"][0]
    job["id"] = "job-invalid-artifact-kind"
    job["job_type"] = AnalysisJobType.run_fea.value
    job["adapter_name"] = "calculix-fea-worker"
    job["artifacts"][0]["job_id"] = job["id"]
    job["artifacts"][0]["kind"] = "bom"

    response = local_client.post("/api/projects", json=project)

    assert response.status_code == 422
    assert "requires artifact kind 'fea_summary', not 'bom'" in response.json()["detail"]
    assert local_client.get("/api/projects/project-invalid-artifact-kind").status_code == 404


def test_analysis_job_contract_supports_planning_and_local_stub_execution() -> None:
    created = client.post(
        "/api/analysis-jobs",
        json={
            "job_type": AnalysisJobType.generate_manufacturing_report.value,
            "target_id": "project-open-gripper-demo",
            "project_id": "project-open-gripper-demo",
            "input_summary": {"selected_part_ids": ["part-finger-link"]},
        },
    ).json()

    listed = client.get("/api/analysis-jobs", params={"project_id": "project-open-gripper-demo"})
    assert listed.status_code == 200
    assert any(job["id"] == created["id"] for job in listed.json())

    fetched = client.get(f"/api/analysis-jobs/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["input_summary"]["selected_part_ids"] == ["part-finger-link"]

    plan = client.get(f"/api/analysis-jobs/{created['id']}/plan")
    assert plan.status_code == 200
    plan_payload = plan.json()
    assert plan_payload["adapter_name"] == "supplier-options-worker"
    assert plan_payload["queue_name"] == "supplier-local"
    assert "manufacturing_report" in plan_payload["expected_artifacts"]

    completed = client.post(f"/api/analysis-jobs/{created['id']}/run-stub")
    assert completed.status_code == 200
    completed_payload = completed.json()
    assert completed_payload["status"] == "completed"
    assert completed_payload["artifacts"][0]["generated_by"] == "supplier-options-worker"
    assert completed_payload["result_summary"]["artifact_kind"] == "manufacturing_report"


def test_analysis_job_request_accepts_unrelated_extension_fields() -> None:
    response = client.post(
        "/api/analysis-jobs",
        json={
            "job_type": AnalysisJobType.run_fea.value,
            "target_id": "project-open-gripper-demo",
            "project_id": "project-open-gripper-demo",
            "trace_id": "trace-review-contract",
        },
    )

    assert response.status_code == 202
    assert "trace_id" not in response.json()
