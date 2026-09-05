"""Config loading and merging. CLI overrides > --config file > configs/default.yaml."""
from __future__ import annotations

import copy
from pathlib import Path

import yaml


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load_config(extra: Path | None = None, overrides: dict | None = None) -> dict:
    root = repo_root()
    cfg = yaml.safe_load((root / "configs" / "default.yaml").read_text())
    if extra:
        cfg = deep_merge(cfg, yaml.safe_load(Path(extra).read_text()))
    if overrides:
        cfg = deep_merge(cfg, {k: v for k, v in overrides.items() if v is not None})
    return cfg


def load_printer(name: str) -> dict:
    root = repo_root()
    path = root / "configs" / "printers" / f"{name}.yaml"
    if not path.exists():
        available = sorted(p.stem for p in path.parent.glob("*.yaml"))
        raise FileNotFoundError(f"printer profile '{name}' not found. Available: {available}")
    printer = yaml.safe_load(path.read_text())
    printer["_profile_dir"] = str(path.parent / "profiles")
    return printer
