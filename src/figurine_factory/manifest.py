"""Run manifest: everything needed to reproduce a good result.

A figurine you cannot reproduce is a one-off, not a factory.
"""
from __future__ import annotations

import json
import platform
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path


def _git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except Exception:
        return "unknown"


def _tool_versions() -> dict:
    versions = {"python": platform.python_version(), "platform": platform.platform()}
    for mod in ("trimesh", "numpy", "pymeshlab"):
        try:
            versions[mod] = __import__(mod).__version__
        except Exception:
            versions[mod] = "not installed"
    return versions


@dataclass
class Manifest:
    run_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    started_at: float = field(default_factory=time.time)
    subject_alias: str = "subject"
    git_sha: str = field(default_factory=_git_sha)
    tools: dict = field(default_factory=_tool_versions)
    config: dict = field(default_factory=dict)
    style: dict = field(default_factory=dict)
    generator: dict = field(default_factory=dict)
    stages: dict = field(default_factory=dict)
    mesh_stats: dict = field(default_factory=dict)
    gates: list = field(default_factory=list)
    outcome: str = "incomplete"
    failure_reason: str | None = None

    def stage(self, name: str, **detail) -> None:
        self.stages[name] = {"at": time.time() - self.started_at, **detail}

    def write(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.__dict__, indent=2, default=str))
        return path

    @staticmethod
    def read(path: Path) -> dict:
        return json.loads(Path(path).read_text())
