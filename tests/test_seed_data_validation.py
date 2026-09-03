#!/usr/bin/env python3
"""Regression tests for seed catalog and handoff data."""

from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

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
        from mechaflow_cad.integrations import adapter_ids

        adapter_seed = self.load_json("data/integration-adapters.seed.json")
        self.assertEqual({item["id"] for item in adapter_seed}, set(adapter_ids()))


if __name__ == "__main__":
    unittest.main()
