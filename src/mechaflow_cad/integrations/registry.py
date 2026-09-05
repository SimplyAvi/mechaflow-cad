"""Registry for documented integration adapter stubs."""

from __future__ import annotations

from .contracts import IntegrationAdapter
from .stub_adapters import (
    CalculixGmshAdapter,
    FreeCADAdapter,
    FreeCADFeaPrepAdapter,
    GmshMeshingAdapter,
    KiCadStepUpAdapter,
    ManufacturingPacketAdapter,
    MaterialsStandardsAdapter,
    RosUrdfAdapter,
    WireVizAdapter,
)


def build_stub_adapters() -> tuple[IntegrationAdapter, ...]:
    """Return one stub instance for each documented first-wave adapter."""

    return (
        FreeCADAdapter(),
        FreeCADFeaPrepAdapter(),
        GmshMeshingAdapter(),
        CalculixGmshAdapter(),
        KiCadStepUpAdapter(),
        WireVizAdapter(),
        RosUrdfAdapter(),
        ManufacturingPacketAdapter(),
        MaterialsStandardsAdapter(),
    )


def adapter_ids() -> tuple[str, ...]:
    """Return stable adapter IDs shared by docs, seed data, and future workers."""

    return tuple(adapter.adapter_id for adapter in build_stub_adapters())
