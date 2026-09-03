#!/usr/bin/env python3
"""End-to-end smoke test for the local frontend plus backend path."""

from __future__ import annotations

import http.client
import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
STARTUP_TIMEOUT_SECONDS = 15


def stream_output(process: subprocess.Popen[str], lines: queue.Queue[str]) -> None:
    assert process.stdout is not None
    for line in process.stdout:
        lines.put(line)
    lines.put("")


def read_startup_url(process: subprocess.Popen[str], lines: queue.Queue[str]) -> str:
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError("timed out waiting for server startup URL")
        try:
            line = lines.get(timeout=remaining)
        except queue.Empty:
            raise RuntimeError("timed out waiting for server startup URL") from None
        if "http://" in line:
            return line.strip().rsplit(" ", 1)[-1]
        if not line:
            raise RuntimeError(f"server exited early with {process.poll()}")


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=5) as response:
        return response.read()


def request_path(base_url: str, path: str) -> tuple[int, bytes, str]:
    parsed = urlsplit(base_url)
    connection = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=5)
    try:
        connection.putrequest("GET", path, skip_accept_encoding=True)
        connection.endheaders()
        response = connection.getresponse()
        return response.status, response.read(), response.getheader("Content-Type", "")
    finally:
        connection.close()


def main() -> int:
    node = shutil.which("node")
    if node is None:
        raise RuntimeError(
            "node is required for the frontend-to-backend smoke proof. "
            "Install Node.js (open source) to run tests/smoke_test.py."
        )

    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    env["MECHAFLOW_HOST"] = env.get("MECHAFLOW_HOST", "127.0.0.1")
    env["MECHAFLOW_PORT"] = env.get("MECHAFLOW_PORT", "0")

    process = subprocess.Popen(
        [sys.executable, "-m", "mechaflow_cad.app"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    lines: queue.Queue[str] = queue.Queue()
    reader = threading.Thread(target=stream_output, args=(process, lines), daemon=True)
    reader.start()
    try:
        base_url = read_startup_url(process, lines)
        health = json.loads(fetch(f"{base_url}/api/health"))
        assert health["ok"] is True
        assert health["status"] == "ok"

        metadata = json.loads(fetch(f"{base_url}/api/metadata"))
        assert "reference_designs" in metadata["concepts"]

        backend_designs = json.loads(fetch(f"{base_url}/api/reference-designs"))
        assert any(item["id"] == "gaiahand" for item in backend_designs)

        health_with_query = json.loads(fetch(f"{base_url}/api/health?cache-buster=1"))
        assert health_with_query["ok"] is True

        catalog = json.loads(fetch(f"{base_url}/api/catalog/reference-designs"))
        assert len(catalog["items"]) >= 3
        assert any(item["license"]["compatibility"] == "uncertain" for item in catalog["items"])
        assert all("handoff" in item and "license_gate" in item["handoff"] for item in catalog["items"])

        adapters = json.loads(fetch(f"{base_url}/api/data/integration-adapters"))
        assert any(item["id"] == "freecad" for item in adapters["items"])

        handoff = json.loads(fetch(f"{base_url}/api/data/backend-frontend-handoff"))
        assert handoff["items"]["mvp_seed_project"]["reference_design_id"] == "gaiahand"

        runtime_status, runtime_body, runtime_content_type = request_path(base_url, "/runtime-config.js")
        assert runtime_status == 200
        assert runtime_content_type.startswith("application/javascript")
        runtime_config = json.loads(runtime_body.decode("utf-8").partition(" = ")[2].removesuffix(";\n"))
        assert runtime_config == {"apiBaseUrl": "", "catalogApiUrl": "/api/catalog/reference-designs"}

        unknown_status, _, _ = request_path(base_url, "/api/does-not-exist")
        assert unknown_status == 404
        for raw_target in ("/../AGENTS.md", "/%2e%2e/AGENTS.md"):
            traversal_status, traversal_body, _ = request_path(base_url, raw_target)
            assert traversal_status == 404
            assert b"Project agent memory" not in traversal_body

        subprocess.run(
            [node, str(ROOT / "tests" / "frontend_smoke.mjs"), base_url],
            cwd=ROOT,
            check=True,
        )
    finally:
        if process.poll() is None:
            process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

    print("Smoke test passed")
    return 0


def test_seed_app_end_to_end() -> None:
    assert main() == 0


if __name__ == "__main__":
    sys.exit(main())
