"""Lightweight integration contracts.

These are intentionally implementation-neutral stubs. Real adapters should keep
external tools optional until the user installs and licenses them locally.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class AdapterCapability:
    """A declared operation an adapter can perform."""

    name: str
    input_formats: tuple[str, ...]
    output_formats: tuple[str, ...]
    required_tools: tuple[str, ...]
    license_review_required: bool = True


@dataclass(frozen=True)
class IntegrationResult:
    """Result metadata returned by an adapter operation."""

    artifact_paths: tuple[Path, ...] = ()
    warnings: tuple[str, ...] = ()
    confidence: str = "unknown"
    metadata: dict[str, str] = field(default_factory=dict)


class IntegrationAdapter(Protocol):
    """Protocol all adapter implementations should satisfy."""

    adapter_id: str
    capabilities: tuple[AdapterCapability, ...]

    def probe(self) -> IntegrationResult:
        """Check whether optional local tools are available without installing them."""

    def run(self, workspace: Path, request_path: Path) -> IntegrationResult:
        """Execute one adapter request in a project workspace."""
