#!/usr/bin/env python3
"""Seed qBittorrent WebUI credentials before the server starts.

The official `qbittorrentofficial/qbittorrent-nox` image generates a random
temporary password on first boot when no WebUI password is configured. That
makes unattended deployments (Kubernetes, Compose) awkward, because See cannot
log in until someone reads the container logs and sets a password by hand.

This script writes a PBKDF2-SHA512 hash derived from `QBIT_USER`/`QBIT_PASS`
into the qBittorrent configuration file, so both qBittorrent and See agree on
the same credentials from the very first start.

Usage:
    QBIT_USER=admin QBIT_PASS=secret python3 qbit-seed-config.py

Set `QBT_EXEC_ENTRYPOINT=1` to hand over to the image's own `/entrypoint.sh`
after seeding (used by docker-compose, where this script replaces the image
entrypoint).
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
import sys
from pathlib import Path

ITERATIONS = 100_000
SALT_BYTES = 16
DEFAULT_CONFIG = "/config/qBittorrent/config/qBittorrent.conf"
SECTION = "WebUI"
USERNAME_KEY = "Username"
PASSWORD_KEY = "Password_PBKDF2"


def hash_password(password: str) -> str:
    """Return qBittorrent's `salt:hash` base64 format for PBKDF2-SHA512."""
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha512", password.encode("utf-8"), salt, ITERATIONS)
    return f"{base64.b64encode(salt).decode('ascii')}:{base64.b64encode(digest).decode('ascii')}"


def apply_values(lines: list[str], values: dict[str, str]) -> list[str]:
    """Set keys in [WebUI], leaving every other section untouched."""
    out: list[str] = []
    remaining = dict(values)
    in_section = False
    seen_section = False

    def flush() -> None:
        for key, value in remaining.items():
            out.append(f"{key}={value}")
        remaining.clear()

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            if in_section:
                flush()
            in_section = stripped[1:-1].strip().lower() == SECTION.lower()
            seen_section = seen_section or in_section
            out.append(line)
            continue
        if in_section and "=" in stripped and not stripped.startswith(("#", ";")):
            key = stripped.split("=", 1)[0].strip()
            if key in remaining:
                out.append(f"{key}={remaining.pop(key)}")
                continue
        out.append(line)

    if in_section:
        flush()
    if not seen_section:
        if out and out[-1].strip():
            out.append("")
        out.append(f"[{SECTION}]")
        out.extend(f"{key}={value}" for key, value in remaining.items())
    return out


def main() -> int:
    config = Path(os.environ.get("QBIT_CONFIG", DEFAULT_CONFIG))
    username = os.environ.get("QBIT_USER", "").strip() or "admin"
    password = os.environ.get("QBIT_PASS", "")

    if not password:
        print(
            "qbit-seed-config: QBIT_PASS is empty, leaving the WebUI password untouched",
            file=sys.stderr,
        )
    else:
        lines = config.read_text(encoding="utf-8").splitlines() if config.exists() else []
        values = {
            USERNAME_KEY: username,
            PASSWORD_KEY: f'"@ByteArray({hash_password(password)})"',
        }
        updated = apply_values(lines, values)
        config.parent.mkdir(parents=True, exist_ok=True)
        config.write_text("\n".join(updated) + "\n", encoding="utf-8")
        print(
            f"qbit-seed-config: WebUI credentials seeded for {username!r} in {config}",
            file=sys.stderr,
        )

    if os.environ.get("QBT_EXEC_ENTRYPOINT", "").strip().lower() in {"1", "true", "yes"}:
        os.execv("/entrypoint.sh", ["/entrypoint.sh", *sys.argv[1:]])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
