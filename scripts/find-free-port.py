#!/usr/bin/env python3
"""Print an available local TCP port for development.

Use this when multiple local projects are running and you want to choose an
explicit MECHAFLOW_API_PORT or MECHAFLOW_FRONTEND_PORT before starting servers.
"""

from __future__ import annotations

import socket


def main() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        print(sock.getsockname()[1])


if __name__ == "__main__":
    main()
