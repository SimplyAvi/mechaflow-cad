import pytest

from mechaflow_api.models import ManufacturingProcess, Modification
from mechaflow_api.services import InvalidDimensionChangeError, PartNotFoundError, apply_project_modification
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
    assert part.metadata["preferred_manufacturing_process"] == "additive_fdm"
    assert result.report.project_id == project.id
    assert result.report.risks
    assert result.project.modifications == [modification]
    assert result.project.reports == [result.report]


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
