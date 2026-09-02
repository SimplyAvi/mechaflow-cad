#!/usr/bin/env python3
"""Run the backend and lightweight frontend together for local development."""

from __future__ import annotations

import functools
import http.server
import json
import os
import signal
import socket
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT / "frontend"


def find_free_port(host: str) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def env_port(name: str, host: str) -> int:
    raw = os.environ.get(name)
    if raw:
        value = int(raw)
        if value < 1 or value > 65535:
            raise ValueError(f"{name} must be between 1 and 65535 for the dev runner")
        return value
    return find_free_port(host)


class RuntimeConfigHandler(http.server.SimpleHTTPRequestHandler):
    api_base_url: str = ""

    def do_GET(self) -> None:  # noqa: N802 - inherited API name
        if self.path == "/runtime-config.js":
            payload = {"apiBaseUrl": self.api_base_url}
            body = f"window.MECHA_FLOW_CONFIG = {json.dumps(payload)};\n".encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def main() -> int:
    api_host = os.environ.get("MECHAFLOW_API_HOST", "127.0.0.1")
    frontend_host = os.environ.get("MECHAFLOW_FRONTEND_HOST", "127.0.0.1")
    api_port = env_port("MECHAFLOW_API_PORT", api_host)
    frontend_port = env_port("MECHAFLOW_FRONTEND_PORT", frontend_host)
    api_base_url = f"http://{api_host}:{api_port}"
    frontend_origin = f"http://{frontend_host}:{frontend_port}"

    env = os.environ.copy()
    env["MECHAFLOW_API_HOST"] = api_host
    env["MECHAFLOW_API_PORT"] = str(api_port)
    env.setdefault("MECHAFLOW_CORS_ORIGINS", frontend_origin)
    pythonpath = str(ROOT / "backend")
    env["PYTHONPATH"] = f"{pythonpath}{os.pathsep}{env['PYTHONPATH']}" if env.get("PYTHONPATH") else pythonpath

    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "mechaflow_api.main:app", "--host", api_host, "--port", str(api_port)],
        cwd=ROOT,
        env=env,
    )

    RuntimeConfigHandler.api_base_url = api_base_url
    handler = functools.partial(RuntimeConfigHandler, directory=str(FRONTEND_DIR))
    frontend = http.server.ThreadingHTTPServer((frontend_host, frontend_port), handler)
    frontend_thread = threading.Thread(target=frontend.serve_forever, daemon=True)
    frontend_thread.start()

    print(f"MechaFlow API:      {api_base_url}/api/docs")
    print(f"MechaFlow frontend: {frontend_origin}")
    print("Set MECHAFLOW_API_PORT and MECHAFLOW_FRONTEND_PORT to choose explicit ports.")

    def shutdown(signum: int, _frame: object) -> None:
        print(f"\nStopping dev servers after signal {signum}...")
        frontend.shutdown()
        backend.terminate()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        return backend.wait()
    finally:
        frontend.shutdown()
        if backend.poll() is None:
            backend.terminate()


if __name__ == "__main__":
    raise SystemExit(main())
