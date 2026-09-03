import json
from pathlib import Path

from fastapi.testclient import TestClient

import mechaflow_api.main as main_module
from mechaflow_api.main import app
from mechaflow_api.models import AnalysisJobType, ManufacturingProcess


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


def test_frontend_mock_projection_matches_backend_seed_contract() -> None:
    backend_project = client.get("/api/projects/sample").json()
    with (ROOT / "src" / "data" / "backendPanelData.json").open(encoding="utf-8") as handle:
        frontend_panel = json.load(handle)

    frontend_project = frontend_panel["project"]
    backend_assembly = backend_project["assemblies"][0]
    frontend_assembly = frontend_project["assemblies"][0]
    assert frontend_project["id"] == backend_project["id"]
    assert frontend_project["reference_design_id"] == backend_project["reference_design_id"]
    assert {part["id"] for part in frontend_assembly["parts"]} == {part["id"] for part in backend_assembly["parts"]}
    assert {material["id"] for material in frontend_project["materials"]} == {
        material["id"] for material in backend_project["materials"]
    }
    assert frontend_panel["task_requirements"] == [backend_project["active_task"]]
    assert {
        route["id"]: (route["from_connector"]["part_id"], route["to_connector"]["part_id"])
        for route in frontend_assembly["wiring_routes"]
    } == {
        route["id"]: (route["from_connector"]["part_id"], route["to_connector"]["part_id"])
        for route in backend_assembly["wiring_routes"]
    }


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

    response = client.post("/api/projects", json=sample)

    assert response.status_code == 201
    assert response.json()["id"] == "project-test"

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


def test_project_modification_endpoint_updates_part_and_returns_report() -> None:
    sample = client.get("/api/projects/sample").json()
    sample["id"] = "project-modification-flow"
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
    assert edited_part["metadata"]["preferred_manufacturing_process"] == "additive_fdm"
    assert payload["report"]["status"] == "requires_review"
    assert payload["report"]["task_results"][0]["status"] == "requires_review"

    stored = client.get("/api/projects/project-modification-flow").json()
    assert stored["modifications"][0]["id"] == "mod-finger-material-thickness"
    assert stored["reports"][0]["id"] == payload["report"]["id"]


def test_project_modification_rejects_unknown_material_and_dimension() -> None:
    sample = client.get("/api/projects/sample").json()
    sample["id"] = "project-invalid-modification-flow"
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


def test_panel_data_deduplicates_a_roundtripped_runtime_job() -> None:
    local_client = TestClient(main_module.create_app())
    sample = local_client.get("/api/projects/sample").json()
    sample["id"] = "project-job-roundtrip"
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
