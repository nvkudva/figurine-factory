"""The Python writer and the Bun reader share one schema. This holds up the writer's end."""
import json
import sqlite3

import pytest

from figurine_factory.config import load_config, load_printer
from figurine_factory.manifest import Manifest
from figurine_factory.stages import repair as repair_stage
from figurine_factory.stages.validate import run_gates
from figurine_factory.web.sqlite_sink import publish
from tests.fixtures import make_fixtures


@pytest.fixture
def published(tmp_path):
    """A real repair run, written to a manifest and published, end to end."""
    cfg = load_config()
    mesh = make_fixtures.with_floating_shells(make_fixtures.good_figure())
    repaired, record = repair_stage.repair(mesh, cfg["repair"])
    gates = run_gates(repaired, cfg["validate"], load_printer("bambu_p1s_0.4"))

    mf = Manifest(config=cfg, subject_alias="subject-a")
    mf.stage("repair", **record)
    mf.mesh_stats = {"before": record["before"], "after": record["after"]}
    mf.gates = [g.to_dict() for g in gates]
    mf.outcome = "pass"

    run_dir = tmp_path / "out" / mf.run_id
    run_dir.mkdir(parents=True)
    repaired.export(run_dir / "figurine.stl")
    mf.write(run_dir / "manifest.json")

    db = tmp_path / "figurine.db"
    run_id = publish(run_dir / "manifest.json", db)
    return run_id, sqlite3.connect(db)


def test_run_row_carries_the_headline_facts(published):
    run_id, conn = published
    row = conn.execute(
        "SELECT subject_alias, outcome, height_mm, printer, mesh_path FROM runs WHERE run_id = ?",
        (run_id,),
    ).fetchone()
    assert row[0] == "subject-a"
    assert row[1] == "pass"
    assert row[2] == 100.0
    assert row[3] == "bambu_p1s_0.4"
    assert row[4].endswith("figurine.stl")


def test_gates_round_trip_in_order(published):
    run_id, conn = published
    rows = conn.execute(
        "SELECT gate, passed FROM gates WHERE run_id = ? ORDER BY ord", (run_id,)
    ).fetchall()
    assert [r[0] for r in rows][:3] == ["watertight", "winding_consistent", "shell_count"]
    assert all(r[1] == 1 for r in rows)


def test_repair_reduces_shells_across_the_seam(published):
    run_id, conn = published
    stats = dict(conn.execute(
        "SELECT phase, shells FROM stats WHERE run_id = ?", (run_id,)
    ).fetchall())
    assert stats["before"] == 5
    assert stats["after"] == 1


def test_republishing_replaces_rather_than_duplicates(published, tmp_path):
    run_id, conn = published
    manifest = json.loads(conn.execute(
        "SELECT manifest_json FROM runs WHERE run_id = ?", (run_id,)
    ).fetchone()[0])
    path = tmp_path / "again.json"
    path.write_text(json.dumps(manifest))
    publish(path, tmp_path / "figurine.db")

    conn2 = sqlite3.connect(tmp_path / "figurine.db")
    assert conn2.execute("SELECT COUNT(*) FROM runs").fetchone()[0] == 1
    assert conn2.execute("SELECT COUNT(*) FROM gates WHERE run_id = ?", (run_id,)).fetchone()[0] == 8


def test_non_finite_volume_becomes_null_not_zero(tmp_path):
    """A non-watertight mesh has NaN volume. Storing 0 would read as a real measurement."""
    manifest = {
        "run_id": "deadbeef", "outcome": "validation_failed", "gates": [],
        "mesh_stats": {"after": {"vertices": 10, "faces": 8, "shells": 3,
                                 "watertight": False, "open_boundary_loops": 2,
                                 "min_wall_mm": 0.4, "volume_mm3": float("nan"),
                                 "bbox_mm": [1, 2, 3]}},
        "stages": {},
    }
    path = tmp_path / "m.json"
    path.write_text(json.dumps(manifest).replace("NaN", "null"))
    manifest["mesh_stats"]["after"]["volume_mm3"] = float("nan")
    path.write_text(json.dumps(manifest))  # json.dumps emits NaN, which json.loads accepts

    publish(path, tmp_path / "db.sqlite")
    conn = sqlite3.connect(tmp_path / "db.sqlite")
    assert conn.execute("SELECT volume_mm3 FROM stats").fetchone()[0] is None
