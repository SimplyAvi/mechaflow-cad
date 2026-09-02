from __future__ import annotations

import functools
import http.server
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT / "frontend"


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def read_url(url: str) -> str:
    with urllib.request.urlopen(url, timeout=3) as response:  # noqa: S310 - local smoke test URL
        return response.read().decode("utf-8")


class RuntimeConfigHandler(http.server.SimpleHTTPRequestHandler):
    api_base_url: str = ""

    def do_GET(self) -> None:  # noqa: N802 - inherited API name
        if self.path == "/runtime-config.js":
            body = f"window.MECHA_FLOW_CONFIG = {json.dumps({'apiBaseUrl': self.api_base_url})};\n".encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


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
    frontend_port = find_free_port()
    api_base_url = f"http://127.0.0.1:{api_port}"
    frontend_base_url = f"http://127.0.0.1:{frontend_port}"
    env = os.environ.copy()
    env["MECHAFLOW_API_PORT"] = str(api_port)
    env["MECHAFLOW_CORS_ORIGINS"] = frontend_base_url
    env["PYTHONPATH"] = f"{ROOT / 'backend'}{os.pathsep}{env['PYTHONPATH']}" if env.get("PYTHONPATH") else str(ROOT / "backend")

    backend = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "mechaflow_api.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(api_port),
            "--log-level",
            "warning",
        ],
        cwd=ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    RuntimeConfigHandler.api_base_url = api_base_url
    handler = functools.partial(RuntimeConfigHandler, directory=str(FRONTEND_DIR))
    frontend = http.server.ThreadingHTTPServer(("127.0.0.1", frontend_port), handler)
    thread = threading.Thread(target=frontend.serve_forever, daemon=True)
    thread.start()

    try:
        wait_for_health(api_base_url, backend)
        assert "MechaFlow CAD" in read_url(frontend_base_url)
        assert api_base_url in read_url(f"{frontend_base_url}/runtime-config.js")
        assert "/api/metadata" in read_url(f"{frontend_base_url}/app.js")
        metadata = json.loads(read_url(f"{api_base_url}/api/metadata"))
        assert "reference_designs" in metadata["concepts"]
    finally:
        frontend.shutdown()
        backend.terminate()
        try:
            backend.wait(timeout=5)
        except subprocess.TimeoutExpired:
            backend.kill()
