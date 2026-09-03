#!/usr/bin/env python3
"""End-to-end smoke test for the local frontend plus backend path."""

from __future__ import annotations

import json
import http.client
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def read_startup_url(process: subprocess.Popen[str]) -> str:
    deadline = time.time() + 10
    while time.time() < deadline:
        line = process.stdout.readline() if process.stdout else ""
        if "http://" in line:
            return line.strip().rsplit(" ", 1)[-1]
        if process.poll() is not None:
            stderr = process.stderr.read() if process.stderr else ""
            raise RuntimeError(f"server exited early with {process.returncode}: {stderr}")
    raise RuntimeError("timed out waiting for server startup URL")


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=5) as response:
        return response.read()


def request_path(base_url: str, path: str) -> tuple[int, bytes, str]:
    parsed = urlsplit(base_url)
    connection = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=5)
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        return response.status, response.read(), response.getheader("Content-Type", "")
    finally:
        connection.close()


def main() -> int:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    env["MECHAFLOW_HOST"] = env.get("MECHAFLOW_HOST", "127.0.0.1")
    env["MECHAFLOW_PORT"] = "0"

    process = subprocess.Popen(
        [sys.executable, "-m", "mechaflow_cad.app"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        base_url = read_startup_url(process)
        health = json.loads(fetch(f"{base_url}/api/health"))
        assert health["ok"] is True
        assert health["status"] == "ok"

        metadata = json.loads(fetch(f"{base_url}/api/metadata"))
        assert "reference_designs" in metadata["concepts"]

        backend_designs = json.loads(fetch(f"{base_url}/api/reference-designs"))
        assert any(item["id"] == "gaiahand" for item in backend_designs)

        catalog = json.loads(fetch(f"{base_url}/api/catalog/reference-designs"))
        assert len(catalog["items"]) >= 3
        assert any(item["license"]["compatibility"] == "uncertain" for item in catalog["items"])
        assert all("handoff" in item and "license_gate" in item["handoff"] for item in catalog["items"])

        adapters = json.loads(fetch(f"{base_url}/api/data/integration-adapters"))
        assert any(item["id"] == "freecad" for item in adapters["items"])

        handoff = json.loads(fetch(f"{base_url}/api/data/backend-frontend-handoff"))
        assert handoff["items"]["mvp_seed_project"]["reference_design_id"] == "gaiahand"

        frontend = fetch(f"{base_url}/").decode("utf-8")
        assert "MechaFlow CAD reference designs" in frontend

        runtime_status, runtime_body, runtime_content_type = request_path(base_url, "/runtime-config.js")
        assert runtime_status == 200
        assert runtime_content_type.startswith("application/javascript")
        runtime_config = json.loads(runtime_body.decode("utf-8").partition(" = ")[2].removesuffix(";\n"))
        assert runtime_config == {"apiBaseUrl": "", "catalogApiUrl": "/api/catalog/reference-designs"}

        unknown_status, _, _ = request_path(base_url, "/api/does-not-exist")
        assert unknown_status == 404
        traversal_status, traversal_body, _ = request_path(base_url, "/../README.md")
        assert traversal_status == 404
        assert b"# MechaFlow CAD" not in traversal_body
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

    print("Smoke test passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
