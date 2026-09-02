from fastapi.testclient import TestClient

from mechaflow_api.main import app
from mechaflow_api.models import AnalysisJobType


client = TestClient(app)


def test_health_and_status_endpoints() -> None:
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    status = client.get("/status")
    assert status.status_code == 200
    payload = status.json()
    assert payload["status"] == "degraded"
    assert {adapter["name"] for adapter in payload["adapters"]} >= {"freecad-worker", "calculix-fea-worker"}


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

    materials = client.get("/api/materials")
    assert materials.status_code == 200
    assert {material["id"] for material in materials.json()} >= {
        "mat-aluminum-6061-t6",
        "mat-carbon-fiber-nylon",
        "mat-low-carbon-steel",
    }

    project = client.get("/api/projects/sample")
    assert project.status_code == 200
    payload = project.json()
    assert payload["active_task"]["target_value"] == 50
    assert payload["assemblies"][0]["wiring_routes"][0]["bend_radius_min_mm"] == 12


def test_create_project_validates_core_schema() -> None:
    sample = client.get("/api/projects/sample").json()
    sample["id"] = "project-test"
    sample["name"] = "Schema validation project"

    response = client.post("/api/projects", json=sample)

    assert response.status_code == 201
    assert response.json()["id"] == "project-test"


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
