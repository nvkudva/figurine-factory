"""End-to-end: a bad mesh must not produce an STL, a good one must."""
import pytest

from figurine_factory.config import load_config, load_printer
from figurine_factory.errors import ValidationFailure
from figurine_factory.stages import repair as repair_stage
from figurine_factory.stages.validate import validate
from tests.fixtures import make_fixtures


@pytest.fixture(scope="module")
def cfg():
    return load_config()


@pytest.fixture(scope="module")
def printer():
    return load_printer("bambu_p1s_0.4")


def test_debris_mesh_repairs_and_passes(cfg, printer):
    mesh = make_fixtures.with_floating_shells(make_fixtures.good_figure())
    repaired, record = repair_stage.repair(mesh, cfg["repair"])
    assert record["before"]["shells"] == 5
    assert record["after"]["shells"] == 1
    assert repaired.extents[2] == pytest.approx(100.0, rel=1e-4)
    assert validate(repaired, cfg["validate"], printer)


def test_thin_wall_mesh_fails_after_repair(cfg, printer):
    """Repair must not paper over a wall the nozzle cannot print."""
    mesh = make_fixtures.with_thin_wall()
    repaired, _ = repair_stage.repair(mesh, cfg["repair"])
    with pytest.raises(ValidationFailure) as exc:
        validate(repaired, cfg["validate"], printer)
    assert any(f.gate == "min_wall_thickness" for f in exc.value.failures)
    assert exc.value.exit_code == 2


def test_holey_mesh_becomes_watertight(cfg, printer):
    mesh = make_fixtures.with_hole(make_fixtures.good_figure())
    repaired, record = repair_stage.repair(mesh, cfg["repair"])
    assert not record["before"]["watertight"]
    assert record["after"]["watertight"]
