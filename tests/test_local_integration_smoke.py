from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def find_free_port(excluded_ports: set[int] | None = None) -> int:
    excluded_ports = excluded_ports or set()
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            port = int(sock.getsockname()[1])
        if port not in excluded_ports:
            return port


def read_url(url: str) -> str:
    with urllib.request.urlopen(url, timeout=3) as response:  # noqa: S310 - local smoke test URL
        return response.read().decode("utf-8")


def wait_for_health(api_base_url: str, process: subprocess.Popen[str]) -> None:
    deadline = time.time() + 10
    last_error: Exception | None = None
    while time.time() < deadline:
        if process.poll() is not None:
            raise AssertionError(f"backend exited early with code {process.returncode}")
        try:
            payload = json.loads(read_url(f"{api_base_url}/health"))
            if payload["status"] == "ok":
                return
        except Exception as exc:  # noqa: BLE001 - keep polling until timeout
            last_error = exc
        time.sleep(0.1)
    raise AssertionError(f"backend did not become healthy: {last_error}")


def test_local_frontend_backend_smoke_path() -> None:
    api_port = find_free_port()
    frontend_port = find_free_port({api_port})
    api_base_url = f"http://127.0.0.1:{api_port}"
    frontend_base_url = f"http://127.0.0.1:{frontend_port}"
    env = os.environ.copy()
    env["MECHAFLOW_API_PORT"] = str(api_port)
    env["MECHAFLOW_FRONTEND_PORT"] = str(frontend_port)
    env["MECHAFLOW_CORS_ORIGINS"] = frontend_base_url

    dev_runner = subprocess.Popen(
        [sys.executable, "scripts/run-dev.py"],
        cwd=ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        wait_for_health(api_base_url, dev_runner)
        assert "MechaFlow CAD" in read_url(frontend_base_url)
        runtime_config = read_url(f"{frontend_base_url}/runtime-config.js")
        config = json.loads(runtime_config.partition(" = ")[2].removesuffix(";\n"))
        assert config == {
            "apiBaseUrl": api_base_url,
            "catalogApiUrl": f"{api_base_url}/api/catalog/reference-designs",
            "tasksApiUrl": f"{api_base_url}/api/catalog/tasks",
        }
        metadata = json.loads(read_url(f"{api_base_url}/api/metadata"))
        assert "reference_designs" in metadata["concepts"]
        catalog = json.loads(read_url(f"{api_base_url}/api/catalog/reference-designs"))
        assert any(design["id"] == "gaiahand" for design in catalog["items"])
        tasks = json.loads(read_url(f"{api_base_url}/api/catalog/tasks"))
        assert any(task["id"] == "lift-static-payload" for task in tasks["items"])
    finally:
        dev_runner.terminate()
        try:
            dev_runner.wait(timeout=5)
        except subprocess.TimeoutExpired:
            dev_runner.kill()
            dev_runner.wait(timeout=5)


def test_dev_runner_does_not_start_backend_when_frontend_port_is_busy() -> None:
    api_port = find_free_port()
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied_frontend:
        occupied_frontend.bind(("127.0.0.1", 0))
        occupied_frontend.listen()
        frontend_port = int(occupied_frontend.getsockname()[1])
        env = os.environ.copy()
        env["MECHAFLOW_API_PORT"] = str(api_port)
        env["MECHAFLOW_FRONTEND_PORT"] = str(frontend_port)

        dev_runner = subprocess.Popen(
            [sys.executable, "scripts/run-dev.py"],
            cwd=ROOT,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            _, stderr = dev_runner.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            dev_runner.kill()
            dev_runner.wait(timeout=5)
            raise AssertionError("dev runner did not exit after the frontend bind failed") from None

    assert dev_runner.returncode != 0
    assert "Address already in use" in stderr
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as backend_probe:
        backend_probe.bind(("127.0.0.1", api_port))


def test_dev_runner_rejects_equal_configured_ports() -> None:
    port = find_free_port()
    env = os.environ.copy()
    env["MECHAFLOW_API_PORT"] = str(port)
    env["MECHAFLOW_FRONTEND_PORT"] = str(port)

    result = subprocess.run(
        [sys.executable, "scripts/run-dev.py"],
        cwd=ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=5,
        check=False,
    )

    assert result.returncode != 0
    assert "must be different" in result.stderr
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", port))
