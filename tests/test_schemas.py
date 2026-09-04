from pydantic import ValidationError
import pytest

from mechaflow_api.catalog import DEFAULT_ASSEMBLY, DEFAULT_MATERIALS, DEFAULT_REFERENCE_DESIGNS, GRIPPER_TASK
from mechaflow_api.models import (
    AnalysisArtifact,
    AnalysisArtifactKind,
    AnalysisConstraint,
    AnalysisConstraintType,
    AnalysisJobPlan,
    AnalysisJobRequest,
    AnalysisJobType,
    AnalysisLoadCase,
    AnalysisLoadType,
    ManufacturingOption,
    ManufacturingProcess,
    Material,
    MoneyRange,
    Part,
    RecommendationConfidence,
    TaskKind,
    TaskRequirement,
)
from mechaflow_api.settings import get_settings


def test_seed_data_uses_required_domain_models() -> None:
    assert DEFAULT_REFERENCE_DESIGNS[0].license
    assert DEFAULT_REFERENCE_DESIGNS[0].supported_file_formats
    assert DEFAULT_ASSEMBLY.parts[0].manufacturing_options
    assert DEFAULT_ASSEMBLY.wiring_routes[0].from_connector.name
    assert {material.id for material in DEFAULT_MATERIALS} >= {"mat-aluminum-6061-t6", "mat-carbon-fiber-nylon"}
    assert GRIPPER_TASK.kind is TaskKind.lift_payload


def test_material_schema_rejects_impossible_poisson_ratio() -> None:
    with pytest.raises(ValidationError):
        Material(
            id="bad-material",
            name="Impossible material",
            family="test",
            properties={"poisson_ratio": 0.75},
        )


def test_manufacturing_option_carries_cost_lead_time_and_confidence() -> None:
    option = ManufacturingOption(
        id="mfg-test",
        process=ManufacturingProcess.cnc_machining,
        description="CNC quote packet placeholder",
        cost=MoneyRange(min=10, max=25, confidence=RecommendationConfidence.heuristic),
        lead_time_days_min=2,
        lead_time_days_max=5,
    )

    assert option.cost is not None
    assert option.cost.currency == "USD"
    assert option.confidence is RecommendationConfidence.heuristic


def test_money_range_rejects_inverted_bounds() -> None:
    with pytest.raises(ValidationError):
        MoneyRange(min=100, max=10)


def test_manufacturing_option_rejects_inverted_lead_time() -> None:
    with pytest.raises(ValidationError):
        ManufacturingOption(
            id="mfg-inverted-lead-time",
            process=ManufacturingProcess.cnc_machining,
            description="Invalid lead-time range",
            lead_time_days_min=10,
            lead_time_days_max=2,
        )


def test_task_and_part_schema_model_task_preserving_edits() -> None:
    task = TaskRequirement(
        id="task-fit-envelope",
        kind=TaskKind.fit_envelope,
        description="Fit inside a compact wrist envelope.",
        target_value=120,
        unit="mm",
        validation_method="heuristic",
    )
    part = Part(
        id="part-test",
        name="Adjustable link",
        category="linkage",
        material_id="mat-aluminum-6061-t6",
        dimensions={"length_mm": 100, "thickness_mm": 4},
    )

    assert task.target_value == 120
    assert part.dimensions.length_mm == 100


def test_analysis_job_request_defaults_to_local_compute() -> None:
    request = AnalysisJobRequest(
        job_type=AnalysisJobType.extract_part_list,
        target_id="asm-test",
        project_id="project-test",
    )

    assert request.local_compute_preferred is True


def test_analysis_job_request_requires_project_ownership() -> None:
    with pytest.raises(ValidationError):
        AnalysisJobRequest(job_type=AnalysisJobType.extract_part_list, target_id="asm-test")


def test_analysis_input_models_define_loads_constraints_and_review_state() -> None:
    load_case = AnalysisLoadCase(
        id="load-static-payload",
        name="Static payload",
        description="Preserved task load for pre-solver review.",
        load_type=AnalysisLoadType.force,
        target_part_ids=["part-test"],
        magnitude=50,
        unit="lb",
    )
    constraint = AnalysisConstraint(
        id="constraint-pin",
        name="Pinned mount",
        constraint_type=AnalysisConstraintType.pinned,
        target_part_ids=["part-test"],
        region="M4 shoulder screw faces",
        degrees_of_freedom=["translation_x", "translation_y", "translation_z"],
    )

    assert load_case.review_required is True
    assert constraint.constraint_type is AnalysisConstraintType.pinned


def test_worker_plan_and_artifact_models_define_adapter_contract() -> None:
    plan = AnalysisJobPlan(
        adapter_name="freecad-worker",
        job_type=AnalysisJobType.import_design,
        queue_name="cad-local",
        target_id="ref-open-gripper-demo",
        expected_artifacts=[AnalysisArtifactKind.cad_metadata],
        command_hint="Worker claims jobs from this queue.",
    )
    artifact = AnalysisArtifact(
        id="artifact-test",
        job_id="job-test",
        kind=AnalysisArtifactKind.cad_metadata,
        title="CAD metadata stub",
        summary="Normalized metadata placeholder.",
        generated_by="freecad-worker",
    )

    assert plan.queue_name == "cad-local"
    assert artifact.kind is AnalysisArtifactKind.cad_metadata


def test_settings_read_port_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MECHAFLOW_API_PORT", "9123")

    assert get_settings().port == 9123
