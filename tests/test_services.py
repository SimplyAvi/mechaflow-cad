import pytest

from mechaflow_api.models import ManufacturingProcess, Modification
from mechaflow_api.services import (
    InvalidDimensionChangeError,
    PartNotFoundError,
    apply_project_modification,
    build_project_panel_data,
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
    assert collect_project_manufacturing_options(project)[0].options[0].id == "mfg-finger-cnc"
    assert collect_project_wiring_routes(project)[0].id == "route-finger-sensor"

    panel = build_project_panel_data(project)
    assert panel.project.id == project.id
    assert panel.bom_items[0].name == "Finger link"


def test_project_panel_collectors_extract_frontend_data() -> None:
    project = build_sample_project()

    assert collect_project_task_requirements(project)[0].id == "task-lift-50lb"
    assert collect_project_bom_items(project)[0].part_id == "part-finger-link"
    assert collect_project_manufacturing_options(project)[0].options[0].id == "mfg-finger-cnc"
    assert collect_project_wiring_routes(project)[0].id == "route-finger-sensor"

    panel = build_project_panel_data(project)
    assert panel.project.id == project.id
    assert panel.bom_items[0].name == "Finger link"


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
