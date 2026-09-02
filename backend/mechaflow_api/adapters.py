"""Integration adapter registry.

Real CAD, FEA, electronics, wiring, and supplier integrations are intentionally
stubbed for the first backend foundation. The registry exposes stable capability
metadata so frontend and worker implementations can plug into the same contract.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, Field

from .models import AnalysisJobRequest, AnalysisJobType


class AdapterStatus(BaseModel):
    name: str
    capability: str
    open_source_candidate: str | None = None
    status: str = "stub"
    local_execution: bool = True
    supported_job_types: list[AnalysisJobType]
    notes: list[str] = Field(default_factory=list)


class IntegrationAdapter(Protocol):
    status: AdapterStatus

    def supports(self, request: AnalysisJobRequest) -> bool: ...


@dataclass(frozen=True)
class StubAdapter:
    status: AdapterStatus

    def supports(self, request: AnalysisJobRequest) -> bool:
        return request.job_type in self.status.supported_job_types


ADAPTERS: tuple[StubAdapter, ...] = (
    StubAdapter(
        AdapterStatus(
            name="freecad-worker",
            capability="CAD import/export, assembly parsing, thumbnails, exploded transforms, parametric edits",
            open_source_candidate="FreeCAD",
            supported_job_types=[
                AnalysisJobType.import_design,
                AnalysisJobType.generate_exploded_view,
                AnalysisJobType.extract_part_list,
                AnalysisJobType.estimate_mass_properties,
            ],
            notes=["FreeCAD is not imported by the API process yet; wire through an isolated worker."],
        )
    ),
    StubAdapter(
        AdapterStatus(
            name="calculix-fea-worker",
            capability="Structural simulation, meshing handoff, stress and displacement extraction",
            open_source_candidate="CalculiX and Gmsh",
            supported_job_types=[AnalysisJobType.run_fea, AnalysisJobType.rerate_payload_capability],
            notes=["Jobs remain queued until a real local or cloud worker claims them."],
        )
    ),
    StubAdapter(
        AdapterStatus(
            name="kicad-electronics-worker",
            capability="PCB import, ECAD/MCAD exchange, connector metadata",
            open_source_candidate="KiCad and KiCadStepUp",
            supported_job_types=[AnalysisJobType.check_wire_routing],
            notes=["The first schema models wiring routes without invoking KiCad."],
        )
    ),
    StubAdapter(
        AdapterStatus(
            name="wireviz-harness-worker",
            capability="Harness diagrams and harness BOM generation",
            open_source_candidate="WireViz",
            supported_job_types=[AnalysisJobType.check_wire_routing, AnalysisJobType.generate_bom],
            notes=["Route models can later render WireViz documents from the same schema."],
        )
    ),
    StubAdapter(
        AdapterStatus(
            name="supplier-options-worker",
            capability="Manufacturing process suggestions, supplier options, cost and lead-time estimates",
            open_source_candidate="Public supplier catalogs and replaceable quote adapters",
            supported_job_types=[AnalysisJobType.generate_bom, AnalysisJobType.generate_manufacturing_report],
            notes=["No paid supplier API or secret is required for local development."],
        )
    ),
)


def list_adapter_statuses() -> list[AdapterStatus]:
    return [adapter.status for adapter in ADAPTERS]


def choose_adapter(request: AnalysisJobRequest) -> StubAdapter | None:
    return next((adapter for adapter in ADAPTERS if adapter.supports(request)), None)
