"""Integration adapter contracts for open-source engineering tools."""

from .contracts import AdapterCapability, IntegrationAdapter, IntegrationResult
from .registry import adapter_ids, build_stub_adapters

__all__ = ["AdapterCapability", "IntegrationAdapter", "IntegrationResult", "adapter_ids", "build_stub_adapters"]
