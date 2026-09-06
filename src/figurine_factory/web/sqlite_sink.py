"""Write a run manifest into the SQLite database the web UI reads.

The Python pipeline and the Bun server share one file and never talk to each other.
That keeps the UI out of the pipeline's way: a run that never opens a browser is
unaffected, and the UI works with no Python process alive.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

SCHEMA = (Path(__file__).parent / "schema.sql").read_text()


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    # Off by default in Python's sqlite3. Without it, deleting a run leaves its gates and
    # stats behind, and republishing the same run collides on the stats primary key.
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def publish(manifest_path: Path, db_path: Path) -> str:
    """Insert or replace one run. Returns the run id."""
    manifest = json.loads(Path(manifest_path).read_text())
    run_id = manifest["run_id"]
    run_dir = Path(manifest_path).parent
    mesh = run_dir / "figurine.stl"

    conn = connect(db_path)
    with conn:
        conn.execute("DELETE FROM runs WHERE run_id = ?", (run_id,))
        conn.execute(
            """INSERT INTO runs (run_id, started_at, subject_alias, outcome, style_preset,
                 style_hash, generator_backend, generator_version, seed, height_mm, printer,
                 git_sha, failure_reason, mesh_path, manifest_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                run_id,
                manifest.get("started_at"),
                manifest.get("subject_alias", "subject"),
                manifest.get("outcome", "incomplete"),
                manifest.get("style", {}).get("preset"),
                manifest.get("style", {}).get("hash"),
                manifest.get("generator", {}).get("backend"),
                manifest.get("generator", {}).get("version"),
                manifest.get("generator", {}).get("seed"),
                manifest.get("config", {}).get("repair", {}).get("scale", {}).get("target_height_mm"),
                manifest.get("config", {}).get("printer"),
                manifest.get("git_sha"),
                manifest.get("failure_reason"),
                str(mesh) if mesh.exists() else None,
                json.dumps(manifest),
            ),
        )

        for i, gate in enumerate(manifest.get("gates", [])):
            conn.execute(
                "INSERT INTO gates (run_id, ord, gate, passed, measured, requirement, hint) "
                "VALUES (?,?,?,?,?,?,?)",
                (run_id, i, gate["gate"], int(bool(gate["passed"])), gate["measured"],
                 gate["requirement"], gate.get("hint", "")),
            )

        for phase in ("before", "after"):
            st = manifest.get("mesh_stats", {}).get(phase)
            if not st:
                continue
            conn.execute(
                """INSERT INTO stats (run_id, phase, vertices, faces, shells, watertight,
                     open_boundary_loops, min_wall_mm, volume_mm3, bbox_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (run_id, phase, st.get("vertices"), st.get("faces"), st.get("shells"),
                 int(bool(st.get("watertight"))), st.get("open_boundary_loops"),
                 st.get("min_wall_mm"), _finite(st.get("volume_mm3")),
                 json.dumps(st.get("bbox_mm"))),
            )

        for i, op in enumerate(manifest.get("stages", {}).get("repair", {}).get("operations", [])):
            conn.execute(
                "INSERT INTO ops (run_id, ord, op, changed, detail_json) VALUES (?,?,?,?,?)",
                (run_id, i, op["op"], int(bool(op["changed"])), json.dumps(op["detail"])),
            )

        for name, detail in manifest.get("stages", {}).items():
            if name == "repair":
                detail = {k: v for k, v in detail.items() if k != "operations"}
            conn.execute(
                "INSERT INTO stages (run_id, name, at_seconds, detail_json) VALUES (?,?,?,?)",
                (run_id, name, detail.get("at"), json.dumps(detail)),
            )
    conn.close()
    return run_id


def _finite(value):
    """SQLite stores NaN as NULL anyway; be explicit so the UI shows a dash, not 0."""
    if value is None:
        return None
    try:
        return value if float(value) == float(value) else None
    except (TypeError, ValueError):
        return None
