"""Integration adapter registry.

Real CAD, FEA, electronics, wiring, and supplier integrations are intentionally
stubbed for the first backend foundation. The registry exposes stable capability
metadata so frontend and worker implementations can plug into the same contract.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import uuid4

from pydantic import BaseModel, Field

from .models import (
    AnalysisArtifact,
    AnalysisArtifactKind,
    AnalysisJob,
    AnalysisJobPlan,
    AnalysisJobRequest,
    AnalysisJobType,
    RecommendationConfidence,
)


class AdapterStatus(BaseModel):
    name: str
    capability: str
    open_source_candidate: str | None = None
    status: str = "stub"
    local_execution: bool = True
    queue_name: str
    supported_job_types: list[AnalysisJobType]
    expected_artifacts: list[AnalysisArtifactKind] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class IntegrationAdapter(Protocol):
    status: AdapterStatus

    def supports(self, request: AnalysisJobRequest) -> bool: ...

    def plan(self, request: AnalysisJobRequest) -> AnalysisJobPlan: ...

    def run_stub(self, job: AnalysisJob) -> AnalysisArtifact: ...


@dataclass(frozen=True)
class StubAdapter:
    status: AdapterStatus
    command_hint: str

    def supports(self, request: AnalysisJobRequest) -> bool:
        return request.job_type in self.status.supported_job_types

    def plan(self, request: AnalysisJobRequest) -> AnalysisJobPlan:
        return AnalysisJobPlan(
            adapter_name=self.status.name,
            job_type=request.job_type,
            queue_name=self.status.queue_name,
            target_id=request.target_id,
            local_execution=self.status.local_execution,
            required_capabilities=[self.status.open_source_candidate] if self.status.open_source_candidate else [],
            expected_artifacts=[artifact_kind_for_job(request.job_type)],
            command_hint=self.command_hint,
            notes=self.status.notes,
        )

    def run_stub(self, job: AnalysisJob) -> AnalysisArtifact:
        kind = artifact_kind_for_job(job.job_type)
        return AnalysisArtifact(
            id=f"artifact-{uuid4()}",
            job_id=job.id,
            kind=kind,
            title=f"{job.job_type.value.replace('_', ' ').title()} stub result",
            summary="Local adapter stub completed without invoking CAD, simulation, electronics, or supplier tools.",
            payload={
                "target_id": job.target_id,
                "project_id": job.project_id,
                "advisory": True,
                "next_integration_step": self.command_hint,
            },
            confidence=RecommendationConfidence.heuristic,
            generated_by=self.status.name,
        )


def artifact_kind_for_job(job_type: AnalysisJobType) -> AnalysisArtifactKind:
    return {
        AnalysisJobType.import_design: AnalysisArtifactKind.cad_metadata,
        AnalysisJobType.generate_exploded_view: AnalysisArtifactKind.exploded_view,
        AnalysisJobType.extract_part_list: AnalysisArtifactKind.part_list,
        AnalysisJobType.estimate_mass_properties: AnalysisArtifactKind.mass_properties,
        AnalysisJobType.quick_load_heuristic: AnalysisArtifactKind.load_heuristic,
        AnalysisJobType.run_fea: AnalysisArtifactKind.fea_summary,
        AnalysisJobType.rerate_payload_capability: AnalysisArtifactKind.payload_rerating,
        AnalysisJobType.check_wire_routing: AnalysisArtifactKind.wiring_check,
        AnalysisJobType.generate_bom: AnalysisArtifactKind.bom,
        AnalysisJobType.generate_manufacturing_report: AnalysisArtifactKind.manufacturing_report,
    }[job_type]


ADAPTERS: tuple[StubAdapter, ...] = (
    StubAdapter(
        AdapterStatus(
            name="freecad-worker",
            capability="CAD import/export, assembly parsing, thumbnails, exploded transforms, parametric edits",
            open_source_candidate="FreeCAD",
            queue_name="cad-local",
            supported_job_types=[
                AnalysisJobType.import_design,
                AnalysisJobType.generate_exploded_view,
                AnalysisJobType.extract_part_list,
                AnalysisJobType.estimate_mass_properties,
            ],
            expected_artifacts=[
                AnalysisArtifactKind.cad_metadata,
                AnalysisArtifactKind.exploded_view,
                AnalysisArtifactKind.part_list,
                AnalysisArtifactKind.mass_properties,
            ],
            notes=["FreeCAD is not imported by the API process yet; wire through an isolated worker."],
        ),
        command_hint="Claim cad-local jobs from an isolated FreeCAD worker process and write normalized assembly metadata.",
    ),
    StubAdapter(
        AdapterStatus(
            name="freecad-fea-prep-worker",
            capability="Analysis geometry preparation, named faces, material assignment, and unit normalization",
            open_source_candidate="FreeCAD FEM workbench",
            queue_name="fea-prep-local",
            supported_job_types=[AnalysisJobType.run_fea],
            expected_artifacts=[AnalysisArtifactKind.fea_summary],
            notes=[
                "This prepares solver inputs only; no FEA is run by the API process.",
                "Future workers should attach STEP or BREP, named-face JSON, and material-property JSON artifacts.",
            ],
        ),
        command_hint="Claim fea-prep-local jobs after part selection and write analysis solids, named faces, and material property packages.",
    ),
    StubAdapter(
        AdapterStatus(
            name="gmsh-meshing-worker",
            capability="Finite-element mesh generation from prepared FreeCAD geometry and named regions",
            open_source_candidate="Gmsh",
            queue_name="mesh-local",
            supported_job_types=[AnalysisJobType.run_fea],
            expected_artifacts=[AnalysisArtifactKind.fea_summary],
            notes=[
                "This is a separable pre-solver contract; no mesh is generated by the API process.",
                "Future workers should attach .msh and mesh-quality JSON artifacts before CalculiX runs.",
            ],
        ),
        command_hint="Claim mesh-local jobs after FreeCAD geometry prep and write Gmsh mesh plus quality metadata.",
    ),
    StubAdapter(
        AdapterStatus(
            name="calculix-fea-worker",
            capability="Static structural solve, result extraction, and review-required report packaging",
            open_source_candidate="CalculiX",
            queue_name="fea-local",
            supported_job_types=[
                AnalysisJobType.quick_load_heuristic,
                AnalysisJobType.run_fea,
                AnalysisJobType.rerate_payload_capability,
            ],
            expected_artifacts=[
                AnalysisArtifactKind.load_heuristic,
                AnalysisArtifactKind.fea_summary,
                AnalysisArtifactKind.payload_rerating,
            ],
            notes=[
                "Jobs remain queued until a real local or cloud worker claims them.",
                "Readiness previews define loads and constraints but are not solver results.",
            ],
        ),
        command_hint="Claim fea-local jobs after CAD geometry and Gmsh mesh artifacts exist, then attach CalculiX decks, logs, stress maps, displacement maps, and review reports.",
    ),
    StubAdapter(
        AdapterStatus(
            name="kicad-electronics-worker",
            capability="PCB import, ECAD/MCAD exchange, connector metadata",
            open_source_candidate="KiCad and KiCadStepUp",
            queue_name="electronics-local",
            supported_job_types=[AnalysisJobType.check_wire_routing],
            expected_artifacts=[AnalysisArtifactKind.wiring_check],
            notes=["The first schema models wiring routes without invoking KiCad."],
        ),
        command_hint="Claim electronics-local jobs to map connectors from KiCad metadata into wiring route checks.",
    ),
    StubAdapter(
        AdapterStatus(
            name="wireviz-harness-worker",
            capability="Harness diagrams and harness BOM generation",
            open_source_candidate="WireViz",
            queue_name="harness-local",
            supported_job_types=[AnalysisJobType.check_wire_routing, AnalysisJobType.generate_bom],
            expected_artifacts=[AnalysisArtifactKind.wiring_check, AnalysisArtifactKind.bom],
            notes=["Route models can later render WireViz documents from the same schema."],
        ),
        command_hint="Claim harness-local jobs to render WireViz diagrams and harness BOM artifacts from route metadata.",
    ),
    StubAdapter(
        AdapterStatus(
            name="supplier-options-worker",
            capability="Manufacturing process suggestions, supplier options, cost and lead-time estimates",
            open_source_candidate="Public supplier catalogs and replaceable quote adapters",
            queue_name="supplier-local",
            supported_job_types=[AnalysisJobType.generate_bom, AnalysisJobType.generate_manufacturing_report],
            expected_artifacts=[AnalysisArtifactKind.bom, AnalysisArtifactKind.manufacturing_report],
            notes=["No paid supplier API or secret is required for local development."],
        ),
        command_hint="Claim supplier-local jobs to attach replaceable public catalog estimates without committing API secrets.",
    ),
)

ADAPTERS_BY_NAME = {adapter.status.name: adapter for adapter in ADAPTERS}
DEFAULT_ADAPTER_BY_JOB_TYPE = {
    AnalysisJobType.import_design: "freecad-worker",
    AnalysisJobType.generate_exploded_view: "freecad-worker",
    AnalysisJobType.extract_part_list: "freecad-worker",
    AnalysisJobType.estimate_mass_properties: "freecad-worker",
    AnalysisJobType.quick_load_heuristic: "calculix-fea-worker",
    AnalysisJobType.run_fea: "calculix-fea-worker",
    AnalysisJobType.rerate_payload_capability: "calculix-fea-worker",
    AnalysisJobType.check_wire_routing: "wireviz-harness-worker",
    AnalysisJobType.generate_bom: "supplier-options-worker",
    AnalysisJobType.generate_manufacturing_report: "supplier-options-worker",
}


def list_adapter_statuses() -> list[AdapterStatus]:
    return [adapter.status for adapter in ADAPTERS]


def get_adapter_for_job(job: AnalysisJob) -> StubAdapter | None:
    adapter = ADAPTERS_BY_NAME.get(job.adapter_name)
    if adapter is None or job.job_type not in adapter.status.supported_job_types:
        return None
    return adapter


def choose_adapter(request: AnalysisJobRequest) -> StubAdapter | None:
    adapter = ADAPTERS_BY_NAME.get(DEFAULT_ADAPTER_BY_JOB_TYPE.get(request.job_type, ""))
    return adapter if adapter and adapter.supports(request) else None
