import pytest

from mechaflow_api.models import ManufacturingProcess, MaterialSubstitutionRequest, Modification
from mechaflow_api.services import (
    InvalidDimensionChangeError,
    MaterialProcessCompatibilityError,
    PartNotFoundError,
    apply_project_modification,
    build_material_substitution_options,
    build_material_substitution_preview,
    build_project_panel_data,
    build_wiring_review,
    collect_project_bom_items,
    collect_project_manufacturing_options,
    collect_project_task_requirements,
    collect_project_wiring_routes,
)
from mechaflow_api.storage import build_sample_project


def test_apply_project_modification_returns_updated_project_and_advisory_report() -> None:
    project = build_sample_project()
    modification = Modification(
        id="mod-test",
        target_part_id="part-finger-link",
        description="Thicken the finger link for prototype review.",
        material_id="mat-carbon-fiber-nylon",
        dimension_changes={"thickness_mm": 8},
        manufacturing_process=ManufacturingProcess.additive_fdm,
    )

    result = apply_project_modification(project, modification)
    part = result.project.assemblies[0].parts[0]

    assert part.material_id == "mat-carbon-fiber-nylon"
    assert part.dimensions.thickness_mm == 8
    assert part.mass_kg is None
    assert part.metadata["preferred_manufacturing_process"] == "additive_fdm"
    assert result.report.project_id == project.id
    assert result.report.risks
    assert result.project.modifications == [modification]
    assert result.project.reports == [*project.reports, result.report]


def test_project_panel_collectors_extract_frontend_data() -> None:
    project = build_sample_project()

    assert collect_project_task_requirements(project)[0].id == "task-lift-50lb"
    assert collect_project_bom_items(project)[0].part_id == "part-finger-link"
    assert collect_project_bom_items(project)[0].price == project.assemblies[0].parts[0].manufacturing_options[0].cost
    assert collect_project_bom_items(project)[0].lead_time_days_min == 3
    assert collect_project_manufacturing_options(project)[0].options[0].id == "mfg-finger-cnc"
    assert collect_project_wiring_routes(project)[0].id == "route-finger-sensor"

    panel = build_project_panel_data(project)
    assert panel.project.id == project.id
    assert panel.bom_items[0].name == "Finger link"
    assert panel.electronics_components[0].id == "ec-controller-pcb"
    assert panel.wire_segments[0].bom_item_id == "bom-wire-finger-sensor-lead"
    assert panel.wiring_review is not None
    assert panel.wiring_review.status.value == "warning"


def test_wiring_review_reports_heuristic_evidence_and_bom_linkage() -> None:
    review = build_wiring_review(build_sample_project())

    finger_review = next(item for item in review.route_reviews if item.route_id == "route-finger-sensor")
    main_review = next(item for item in review.route_reviews if item.route_id == "route-main-harness")

    assert review.status.value == "warning"
    assert finger_review.status.value == "warning"
    assert main_review.status.value == "pass"
    assert "not exact electrical or CAD validation" in review.summary
    assert "bom-wire-finger-sensor-lead" in finger_review.bom_item_ids
    assert any(item.basis == "heuristic_estimate" for item in finger_review.evidence)
    assert any(item.check == "BOM linkage" and item.status.value == "pass" for item in finger_review.evidence)


def test_material_substitution_options_are_explicit_compatible_and_review_required() -> None:
    project = build_sample_project()

    options = build_material_substitution_options(project, "part-finger-link")

    assert {option.material_id for option in options} >= {"mat-carbon-fiber-nylon", "mat-low-carbon-steel"}
    assert all(option.compatible for option in options)
    assert all(option.review_required for option in options)
    assert all(option.modification.manufacturing_process is not None for option in options)
    assert all(option.material_id != "mat-fr4-generic" for option in options)
    carbon_fiber = next(option for option in options if option.material_id == "mat-carbon-fiber-nylon")
    assert carbon_fiber.process == ManufacturingProcess.additive_fdm
    assert carbon_fiber.weight_delta_kg is not None
    assert carbon_fiber.weight_delta_kg < 0
    assert carbon_fiber.cost_range == project.assemblies[0].parts[0].manufacturing_options[1].cost
    assert "not supplier quotes" in carbon_fiber.manufacturing_guidance


def test_material_substitution_preview_is_non_persisted_and_projects_panel_updates() -> None:
    project = build_sample_project()
    request = MaterialSubstitutionRequest(
        target_part_id="part-finger-link",
        material_id="mat-carbon-fiber-nylon",
        manufacturing_process=ManufacturingProcess.additive_fdm,
    )

    preview = build_material_substitution_preview(project, request)

    assert preview.mode == "preview"
    assert preview.persisted is False
    assert project.assemblies[0].parts[0].material_id == "mat-aluminum-6061-t6"
    projected_part = preview.panel_data.project.assemblies[0].parts[0]
    assert projected_part.material_id == "mat-carbon-fiber-nylon"
    assert projected_part.metadata["preferred_manufacturing_process"] == "additive_fdm"
    assert preview.panel_data.bom_items[0].price == project.assemblies[0].parts[0].manufacturing_options[1].cost
    assert preview.panel_data.analysis_readiness_previews[0].material_properties.material_id == "mat-carbon-fiber-nylon"
    assert preview.report.status.value == "requires_review"


def test_material_substitution_preview_rejects_incompatible_process() -> None:
    with pytest.raises(MaterialProcessCompatibilityError, match="not explicitly compatible"):
        build_material_substitution_preview(
            build_sample_project(),
            MaterialSubstitutionRequest(
                target_part_id="part-finger-link",
                material_id="mat-carbon-fiber-nylon",
                manufacturing_process=ManufacturingProcess.cnc_machining,
            ),
        )


def test_apply_project_modification_rejects_unknown_part() -> None:
    with pytest.raises(PartNotFoundError):
        apply_project_modification(
            build_sample_project(),
            Modification(id="mod-test", target_part_id="missing", description="Unknown target."),
        )


def test_apply_project_modification_rejects_invalid_dimension_value() -> None:
    with pytest.raises(InvalidDimensionChangeError):
        apply_project_modification(
            build_sample_project(),
            Modification(
                id="mod-test",
                target_part_id="part-finger-link",
                description="Bad thickness.",
                dimension_changes={"thickness_mm": -1},
            ),
        )
