#!/usr/bin/env python3
"""End-to-end smoke test for the local frontend plus backend path."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

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

        catalog = json.loads(fetch(f"{base_url}/api/catalog/reference-designs"))
        assert len(catalog["items"]) >= 3
        assert any(item["license"]["compatibility"] == "uncertain" for item in catalog["items"])

        frontend = fetch(f"{base_url}/").decode("utf-8")
        assert "MechaFlow CAD reference designs" in frontend
        assert "/api/catalog/reference-designs" in frontend
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
