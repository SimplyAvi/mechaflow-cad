"""Tiny local-first API and static frontend server for seed catalog work.

The server intentionally uses only the Python standard library so the public
repository does not gain required paid or closed runtime dependencies.
"""

from __future__ import annotations

import argparse
import json
import os
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = REPO_ROOT / "catalog" / "reference-designs" / "reference-designs.seed.json"
DATASETS = {
    "materials": REPO_ROOT / "data" / "materials.seed.json",
    "tasks": REPO_ROOT / "data" / "tasks.seed.json",
    "manufacturing-methods": REPO_ROOT / "data" / "manufacturing-methods.seed.json",
    "capability-ratings": REPO_ROOT / "data" / "capability-ratings.seed.json",
    "standards-advisory-rules": REPO_ROOT / "data" / "standards-advisory-rules.seed.json",
}
FRONTEND_ROOT = (REPO_ROOT / "frontend").resolve()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


class MechaFlowHandler(SimpleHTTPRequestHandler):
    """Serve API responses and the static frontend from one local process."""

    server_version = "MechaFlowCADSeed/0.1"

    def translate_path(self, path: str) -> str:
        index_page = FRONTEND_ROOT / "index.html"
        relative = unquote(urlsplit(path).path).lstrip("/")
        if not relative:
            return str(index_page)
        candidate = (FRONTEND_ROOT / relative).resolve()
        if FRONTEND_ROOT not in candidate.parents or not candidate.is_file():
            return str(index_page)
        return str(candidate)

    def do_GET(self) -> None:  # noqa: N802, required by BaseHTTPRequestHandler
        route = urlsplit(self.path).path
        if route == "/api/health":
            self._send_json({"ok": True, "service": "mechaflow-cad-seed"})
            return
        if route == "/api/catalog/reference-designs":
            self._send_json({"items": load_json(CATALOG_PATH)})
            return
        if route.startswith("/api/data/"):
            dataset = route.removeprefix("/api/data/")
            path = DATASETS.get(dataset)
            if path is None:
                self._send_json({"error": f"unknown dataset: {dataset}"}, HTTPStatus.NOT_FOUND)
                return
            self._send_json({"items": load_json(path)})
            return
        super().do_GET()

    def _send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, indent=2, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the MechaFlow CAD seed app")
    parser.add_argument("--host", default=os.environ.get("MECHAFLOW_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("MECHAFLOW_PORT", "0")))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        server = ThreadingHTTPServer((args.host, args.port), MechaFlowHandler)
    except OSError as exc:
        raise SystemExit(
            f"Could not bind MechaFlow CAD seed app to {args.host}:{args.port}. "
            "Set MECHAFLOW_PORT to an unused port or use 0 for an OS-selected port. "
            f"Original error: {exc}"
        ) from exc

    host, port = server.server_address[:2]
    print(f"MechaFlow CAD seed app serving frontend and API at http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping MechaFlow CAD seed app", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
