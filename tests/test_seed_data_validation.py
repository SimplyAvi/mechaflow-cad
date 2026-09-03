#!/usr/bin/env python3
"""Regression tests for seed catalog and handoff data."""

from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class SeedDataValidationTest(unittest.TestCase):
    def load_json(self, relative_path: str):
        with (ROOT / relative_path).open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def test_catalog_validator_passes(self) -> None:
        result = subprocess.run(
            [sys.executable, "scripts/validate_catalog.py"],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Catalog validation passed", result.stdout)

    def test_handoff_preserves_catalog_license_gate(self) -> None:
        designs = {item["id"]: item for item in self.load_json("catalog/reference-designs/reference-designs.seed.json")}
        handoff = self.load_json("data/backend-frontend-handoff.seed.json")
        project = handoff["mvp_seed_project"]
        design = designs[project["reference_design_id"]]

        self.assertIn("license_gate", project)
        self.assertTrue(design["license"]["review_required_before_import"])
        self.assertEqual(design["review"]["status"], "needs-license-review")
        self.assertNotIn("ready", project["license_gate"].lower())

    def test_adapter_seed_matches_stub_registry(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        from mechaflow_cad.integrations import adapter_ids, build_stub_adapters

        adapter_seed = self.load_json("data/integration-adapters.seed.json")
        self.assertEqual({item["id"] for item in adapter_seed}, set(adapter_ids()))
        runtime_adapters = {adapter.adapter_id: adapter for adapter in build_stub_adapters()}
        for seeded_adapter in adapter_seed:
            runtime_capabilities = {
                capability.name: capability for capability in runtime_adapters[seeded_adapter["id"]].capabilities
            }
            for seeded_capability in seeded_adapter["capabilities"]:
                self.assertEqual(
                    set(seeded_capability["output_formats"]),
                    set(runtime_capabilities[seeded_capability["id"]].output_formats),
                )

    def test_committed_schema_rejects_missing_handoff(self) -> None:
        sys.path.insert(0, str(ROOT))
        from scripts.validate_catalog import validate_reference_design_schema

        design = copy.deepcopy(self.load_json("catalog/reference-designs/reference-designs.seed.json")[0])
        design.pop("handoff")
        errors: list[str] = []

        validate_reference_design_schema([design], errors)

        self.assertTrue(errors)

    def test_structurally_invalid_design_reports_errors_without_crashing(self) -> None:
        sys.path.insert(0, str(ROOT))
        from scripts import validate_catalog

        design = copy.deepcopy(self.load_json("catalog/reference-designs/reference-designs.seed.json")[0])
        design["license"] = "MIT"
        with tempfile.TemporaryDirectory() as temporary_directory:
            invalid_catalog = Path(temporary_directory) / "reference-designs.json"
            invalid_catalog.write_text(json.dumps([design]), encoding="utf-8")
            errors: list[str] = []
            with patch.object(validate_catalog, "REFERENCE_DESIGNS", invalid_catalog):
                validate_catalog.validate_reference_designs(errors, set(), {})

        self.assertTrue(errors)

    def test_malformed_adapter_entries_report_errors_without_crashing(self) -> None:
        sys.path.insert(0, str(ROOT))
        from scripts import validate_catalog

        adapters = [
            None,
            {
                "id": "malformed-adapter",
                "documentation_path": "docs/integrations/README.md",
                "stub_class": "MalformedAdapter",
                "required_tools": [],
                "dependency_policy": {},
                "capabilities": [
                    None,
                    {
                        "id": "malformed-capability",
                        "backend_job_types": None,
                        "expected_artifacts": None,
                    },
                    {
                        "id": "unhashable-capability",
                        "backend_job_types": [{}],
                        "expected_artifacts": [[]],
                    },
                ],
            },
        ]
        with tempfile.TemporaryDirectory() as temporary_directory:
            invalid_adapters = Path(temporary_directory) / "integration-adapters.json"
            invalid_adapters.write_text(json.dumps(adapters), encoding="utf-8")
            errors: list[str] = []
            with patch.object(validate_catalog, "INTEGRATION_ADAPTERS", invalid_adapters):
                validate_catalog.validate_integration_adapters(errors)

        self.assertIn("integration-adapters[0] must be an object", errors)
        self.assertIn("malformed-adapter capability must be an object", errors)
        self.assertIn("malformed-adapter:malformed-capability backend_job_types must be a list", errors)
        self.assertIn("malformed-adapter:malformed-capability expected_artifacts must be a list", errors)
        self.assertIn("malformed-adapter:unhashable-capability backend_job_types[0] must be a string", errors)
        self.assertIn("malformed-adapter:unhashable-capability expected_artifacts[0] must be a string", errors)

    def test_handoff_aliases_match_backend_runtime_contract(self) -> None:
        sys.path.insert(0, str(ROOT / "backend"))
        from mechaflow_api.adapters import ADAPTERS
        from mechaflow_api.catalog import DEFAULT_MATERIALS, DEFAULT_REFERENCE_DESIGNS
        from mechaflow_api.storage import build_sample_project

        handoff = self.load_json("data/backend-frontend-handoff.seed.json")
        aliases = handoff["id_aliases"]
        adapter_seed = {item["id"]: item for item in self.load_json("data/integration-adapters.seed.json")}
        runtime_adapters = {item.status.name: item.status for item in ADAPTERS}
        adapter_aliases = {item["catalog_id"]: item["backend_name"] for item in aliases["adapters"]}
        sample_project = build_sample_project()
        sample_part_ids = {part.id for assembly in sample_project.assemblies for part in assembly.parts}
        sample_route_ids = {route.id for assembly in sample_project.assemblies for route in assembly.wiring_routes}
        backend_task_ids = {task.id for design in DEFAULT_REFERENCE_DESIGNS for task in design.example_tasks}

        self.assertEqual(handoff["mvp_seed_project"]["id"], sample_project.id)
        reference_alias = next(
            item
            for item in aliases["reference_designs"]
            if item["catalog_id"] == handoff["mvp_seed_project"]["reference_design_id"]
        )
        self.assertEqual(reference_alias["backend_id"], sample_project.reference_design_id)
        catalog_design = next(
            item
            for item in self.load_json("catalog/reference-designs/reference-designs.seed.json")
            if item["id"] == reference_alias["catalog_id"]
        )
        backend_design = next(item for item in DEFAULT_REFERENCE_DESIGNS if item.id == reference_alias["backend_id"])
        self.assertEqual(catalog_design["source"]["url"].rstrip("/"), str(backend_design.source_url).rstrip("/"))
        self.assertEqual(catalog_design["license"]["spdx"], backend_design.license)
        self.assertTrue(
            {item["backend_id"] for item in aliases["materials"]}.issubset({item.id for item in DEFAULT_MATERIALS})
        )
        self.assertTrue(
            set(adapter_aliases.values()).issubset(runtime_adapters)
        )
        catalog_designs = self.load_json("catalog/reference-designs/reference-designs.seed.json")
        required_adapter_ids = {
            adapter_id
            for design in catalog_designs
            for adapter_id in design["handoff"]["required_adapter_ids"]
        }
        self.assertTrue(required_adapter_ids.issubset(adapter_aliases))
        for adapter_id, adapter in adapter_seed.items():
            seeded_job_types = {
                job_type for capability in adapter["capabilities"] for job_type in capability["backend_job_types"]
            }
            seeded_artifacts = {
                artifact for capability in adapter["capabilities"] for artifact in capability["expected_artifacts"]
            }
            if adapter_id not in adapter_aliases:
                self.assertEqual(seeded_job_types, set())
                self.assertEqual(seeded_artifacts, set())
                continue
            runtime_adapter = runtime_adapters[adapter_aliases[adapter_id]]
            self.assertEqual(seeded_job_types, {job_type.value for job_type in runtime_adapter.supported_job_types})
            self.assertEqual(seeded_artifacts, {artifact.value for artifact in runtime_adapter.expected_artifacts})
        for design in catalog_designs:
            supported_job_types = {
                job_type
                for adapter_id in design["handoff"]["required_adapter_ids"]
                for capability in adapter_seed[adapter_id]["capabilities"]
                for job_type in capability["backend_job_types"]
            }
            self.assertTrue(set(design["handoff"]["recommended_job_types"]).issubset(supported_job_types))
        self.assertTrue({item["sample_task_id"] for item in aliases["tasks"]}.issubset(backend_task_ids))
        self.assertTrue(
            {item["id"] for item in handoff["mvp_seed_project"]["sample_parts"]}.issubset(sample_part_ids)
        )
        self.assertTrue(
            {item["id"] for item in handoff["mvp_seed_project"]["sample_wiring_routes"]}.issubset(sample_route_ids)
        )
        handoff_parts = {item["id"]: item for item in handoff["mvp_seed_project"]["sample_parts"]}
        for route in handoff["mvp_seed_project"]["sample_wiring_routes"]:
            self.assertIn(route["id"], handoff_parts[route["from_part_id"]]["wiring_route_ids"])
            self.assertIn(route["id"], handoff_parts[route["to_part_id"]]["wiring_route_ids"])

    def test_malformed_handoff_entries_report_errors_without_crashing(self) -> None:
        sys.path.insert(0, str(ROOT))
        from scripts import validate_catalog

        malformed_handoffs = [
            {"schema_version": "backend-frontend-handoff.v1", "id_aliases": None, "mvp_seed_project": {}},
            {"schema_version": "backend-frontend-handoff.v1", "id_aliases": {}, "mvp_seed_project": None},
            {
                "schema_version": "backend-frontend-handoff.v1",
                "id_aliases": {
                    "reference_designs": [None, {"catalog_id": []}],
                    "capability_ratings": [{"catalog_id": {}, "backend_artifact_kind": []}],
                },
                "mvp_seed_project": {
                    "reference_design_id": [],
                    "sample_parts": [
                        None,
                        {
                            "id": "part-malformed",
                            "material_id": [],
                            "manufacturing_method_id": {},
                            "capability_rating_ids": [{}],
                            "wiring_route_ids": [[]],
                        },
                    ],
                    "sample_wiring_routes": [
                        None,
                        {
                            "id": "route-malformed",
                            "from_part_id": [],
                            "to_part_id": {},
                            "adapter_ids": [[]],
                        },
                    ],
                    "analysis_job_sequence": [
                        None,
                        {"job_type": {}, "adapter_id": [], "artifact_kind": {}},
                    ],
                },
            },
        ]

        for handoff in malformed_handoffs:
            with self.subTest(handoff=handoff), tempfile.TemporaryDirectory() as temporary_directory:
                invalid_handoff = Path(temporary_directory) / "backend-frontend-handoff.json"
                invalid_handoff.write_text(json.dumps(handoff), encoding="utf-8")
                errors: list[str] = []
                with patch.object(validate_catalog, "BACKEND_FRONTEND_HANDOFF", invalid_handoff):
                    validate_catalog.validate_handoff(errors, {}, set(), set(), {})

                self.assertTrue(errors)

    def test_handoff_rejects_invalid_adapter_job_artifact_pairs(self) -> None:
        sys.path.insert(0, str(ROOT))
        from scripts import validate_catalog

        errors: list[str] = []
        ids_by_name = validate_catalog.validate_datasets(errors)
        adapter_ids, adapter_contracts = validate_catalog.validate_integration_adapters(errors)
        design_ids = validate_catalog.validate_reference_designs(errors, adapter_ids, ids_by_name)
        handoff = copy.deepcopy(self.load_json("data/backend-frontend-handoff.seed.json"))
        handoff["mvp_seed_project"]["analysis_job_sequence"][0].update(
            job_type="run_fea",
            adapter_id="freecad",
            artifact_kind="bom",
        )

        with patch.object(validate_catalog, "load_json", return_value=handoff):
            validate_catalog.validate_handoff(
                errors,
                ids_by_name,
                design_ids,
                adapter_ids,
                adapter_contracts,
            )

        self.assertIn("handoff adapter freecad does not support job type run_fea", errors)
        self.assertIn("handoff adapter freecad does not produce artifact bom", errors)
        self.assertIn("handoff job type run_fea must produce artifact fea_summary, not bom", errors)

    def test_handoff_requires_job_and_artifact_from_one_capability(self) -> None:
        sys.path.insert(0, str(ROOT))
        from scripts import validate_catalog

        adapters = copy.deepcopy(self.load_json("data/integration-adapters.seed.json"))
        freecad = next(adapter for adapter in adapters if adapter["id"] == "freecad")
        freecad["capabilities"] = [
            {
                "id": "split-job",
                "backend_job_types": ["run_fea"],
                "expected_artifacts": ["bom"],
            },
            {
                "id": "split-artifact",
                "backend_job_types": ["generate_bom"],
                "expected_artifacts": ["fea_summary"],
            },
        ]
        errors: list[str] = []
        with patch.object(validate_catalog, "load_json", return_value=adapters):
            adapter_ids, adapter_contracts = validate_catalog.validate_integration_adapters(errors)

        ids_by_name = validate_catalog.validate_datasets(errors)
        design_ids = validate_catalog.validate_reference_designs(errors, adapter_ids, ids_by_name)
        handoff = copy.deepcopy(self.load_json("data/backend-frontend-handoff.seed.json"))
        handoff["mvp_seed_project"]["analysis_job_sequence"] = [
            {
                "job_type": "run_fea",
                "adapter_id": "freecad",
                "artifact_kind": "fea_summary",
            }
        ]

        with patch.object(validate_catalog, "load_json", return_value=handoff):
            validate_catalog.validate_handoff(
                errors,
                ids_by_name,
                design_ids,
                adapter_ids,
                adapter_contracts,
            )

        self.assertIn(
            "handoff adapter freecad has no capability for job type run_fea and artifact fea_summary",
            errors,
        )

    def test_committed_schema_rejects_missing_handoff(self) -> None:
        sys.path.insert(0, str(ROOT))
        from scripts.validate_catalog import validate_reference_design_schema

        design = copy.deepcopy(self.load_json("catalog/reference-designs/reference-designs.seed.json")[0])
        design.pop("handoff")
        errors: list[str] = []

        validate_reference_design_schema([design], errors)

        self.assertTrue(errors)

    def test_handoff_aliases_match_backend_runtime_contract(self) -> None:
        sys.path.insert(0, str(ROOT / "backend"))
        from mechaflow_api.adapters import ADAPTERS
        from mechaflow_api.catalog import DEFAULT_MATERIALS, DEFAULT_REFERENCE_DESIGNS
        from mechaflow_api.storage import build_sample_project

        handoff = self.load_json("data/backend-frontend-handoff.seed.json")
        aliases = handoff["id_aliases"]
        sample_project = build_sample_project()
        sample_part_ids = {part.id for assembly in sample_project.assemblies for part in assembly.parts}
        sample_route_ids = {route.id for assembly in sample_project.assemblies for route in assembly.wiring_routes}
        backend_task_ids = {task.id for design in DEFAULT_REFERENCE_DESIGNS for task in design.example_tasks}

        self.assertEqual(handoff["mvp_seed_project"]["id"], sample_project.id)
        reference_alias = next(item for item in aliases["reference_designs"] if item["catalog_id"] == "gaiahand")
        self.assertEqual(reference_alias["backend_id"], sample_project.reference_design_id)
        self.assertTrue(
            {item["backend_id"] for item in aliases["materials"]}.issubset({item.id for item in DEFAULT_MATERIALS})
        )
        self.assertTrue(
            {item["backend_name"] for item in aliases["adapters"]}.issubset({item.status.name for item in ADAPTERS})
        )
        self.assertTrue({item["sample_task_id"] for item in aliases["tasks"]}.issubset(backend_task_ids))
        self.assertTrue(
            {item["id"] for item in handoff["mvp_seed_project"]["sample_parts"]}.issubset(sample_part_ids)
        )
        self.assertTrue(
            {item["id"] for item in handoff["mvp_seed_project"]["sample_wiring_routes"]}.issubset(sample_route_ids)
        )


if __name__ == "__main__":
    unittest.main()
