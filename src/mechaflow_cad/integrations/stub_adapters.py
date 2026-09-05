"""Named adapter stubs for the first implementation wave."""

from __future__ import annotations

from pathlib import Path

from .contracts import AdapterCapability, IntegrationResult


class StubAdapter:
    """Base class for documented adapters that are not implemented yet."""

    adapter_id = "stub"
    capabilities: tuple[AdapterCapability, ...] = ()

    def probe(self) -> IntegrationResult:
        return IntegrationResult(
            warnings=(f"{self.adapter_id} is documented but not implemented in this seed repository.",),
            confidence="stub",
        )

    def run(self, workspace: Path, request_path: Path) -> IntegrationResult:
        return IntegrationResult(
            warnings=(
                f"{self.adapter_id} has no runtime implementation yet.",
                f"workspace={workspace}",
                f"request_path={request_path}",
            ),
            confidence="stub",
        )


class FreeCADAdapter(StubAdapter):
    adapter_id = "freecad"
    capabilities = (
        AdapterCapability(
            name="import-assembly-and-explode",
            input_formats=("FCStd", "STEP", "STL", "OBJ"),
            output_formats=("glTF", "JSON part tree", "STEP", "mass properties JSON"),
            required_tools=("FreeCAD",),
        ),
    )


class FreeCADFeaPrepAdapter(StubAdapter):
    adapter_id = "freecad-fea-prep"
    capabilities = (
        AdapterCapability(
            name="prepare-analysis-geometry",
            input_formats=("FCStd", "STEP", "part-map JSON", "load-case JSON"),
            output_formats=("BREP", "STEP", "named-face JSON", "material-property JSON"),
            required_tools=("FreeCAD",),
        ),
    )


class GmshMeshingAdapter(StubAdapter):
    adapter_id = "gmsh-meshing"
    capabilities = (
        AdapterCapability(
            name="generate-finite-element-mesh",
            input_formats=("BREP", "STEP", "named-face JSON", "mesh-control JSON"),
            output_formats=("MSH", "mesh-quality JSON"),
            required_tools=("Gmsh",),
        ),
    )


class CalculixGmshAdapter(StubAdapter):
    adapter_id = "calculix-gmsh"
    capabilities = (
        AdapterCapability(
            name="static-structural-fea",
            input_formats=("STEP", "BREP", "MSH", "load-case JSON", "constraint JSON", "material-property JSON"),
            output_formats=("INP", "FRD", "DAT", "VTK", "JSON rating report"),
            required_tools=("CalculiX", "Gmsh"),
        ),
    )


class KiCadStepUpAdapter(StubAdapter):
    adapter_id = "kicad-stepup"
    capabilities = (
        AdapterCapability(
            name="ecad-mcad-exchange",
            input_formats=("kicad_pcb", "STEP", "WRL"),
            output_formats=("STEP", "board keepout JSON", "connector table"),
            required_tools=("KiCad", "KiCadStepUp", "FreeCAD"),
        ),
    )


class WireVizAdapter(StubAdapter):
    adapter_id = "wireviz"
    capabilities = (
        AdapterCapability(
            name="harness-documentation",
            input_formats=("WireViz YAML",),
            output_formats=("SVG", "HTML", "BOM CSV", "harness JSON"),
            required_tools=("WireViz",),
        ),
    )


class RosUrdfAdapter(StubAdapter):
    adapter_id = "ros-urdf"
    capabilities = (
        AdapterCapability(
            name="robot-description-import-export",
            input_formats=("URDF", "Xacro", "STL", "DAE"),
            output_formats=("URDF", "link joint JSON", "reach check report"),
            required_tools=("ROS 2", "urdfdom"),
        ),
    )


class ManufacturingPacketAdapter(StubAdapter):
    adapter_id = "manufacturing-quote-packets"
    capabilities = (
        AdapterCapability(
            name="quote-packet-generation",
            input_formats=("STEP", "STL", "DXF", "Gerber", "WireViz YAML", "BOM CSV"),
            output_formats=("RFQ packet directory", "supplier-neutral JSON"),
            required_tools=(),
            license_review_required=False,
        ),
    )


class MaterialsStandardsAdapter(StubAdapter):
    adapter_id = "materials-standards-data"
    capabilities = (
        AdapterCapability(
            name="material-and-rule-pack-loading",
            input_formats=("JSON", "CSV"),
            output_formats=("normalized material JSON", "advisory rule JSON"),
            required_tools=(),
            license_review_required=True,
        ),
    )
