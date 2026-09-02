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
    while True:
        try:
            line = lines.get(timeout=STARTUP_TIMEOUT_SECONDS)
        except queue.Empty:
            raise RuntimeError("timed out waiting for server startup URL") from None
        if "http://" in line:
            return line.strip().rsplit(" ", 1)[-1]
        if not line:
            raise RuntimeError(f"server exited early with {process.poll()}")


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=5) as response:
        return response.read()


def raw_request(base_url: str, target: str) -> str:
    """Send an unnormalized request target the way an attacker's client would."""
    netloc = urlsplit(base_url).netloc
    connection = http.client.HTTPConnection(netloc, timeout=5)
    try:
        connection.putrequest("GET", target, skip_host=False, skip_accept_encoding=True)
        connection.endheaders()
        return connection.getresponse().read().decode("utf-8", errors="replace")
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

        health_with_query = json.loads(fetch(f"{base_url}/api/health?cache-buster=1"))
        assert health_with_query["ok"] is True

        catalog = json.loads(fetch(f"{base_url}/api/catalog/reference-designs"))
        assert len(catalog["items"]) >= 3
        assert any(item["license"]["compatibility"] == "uncertain" for item in catalog["items"])

        for raw_target in ("/../AGENTS.md", "/%2e%2e/AGENTS.md"):
            traversal = raw_request(base_url, raw_target)
            assert "Project agent memory" not in traversal, f"{raw_target} escaped frontend/"
            assert "MechaFlow CAD reference designs" in traversal

        subprocess.run(
            [node, str(ROOT / "tests" / "frontend_smoke.mjs"), base_url],
            cwd=ROOT,
            check=True,
        )
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
