"""The gates must fail on known-bad meshes. A gate that never fires is not a gate."""
import pytest

from figurine_factory.config import load_config, load_printer
from figurine_factory.errors import ValidationFailure
from figurine_factory.stages.validate import run_gates, validate
from tests.fixtures import make_fixtures


@pytest.fixture(scope="module")
def cfg():
    return load_config()["validate"]


@pytest.fixture(scope="module")
def printer():
    return load_printer("bambu_p1s_0.4")


def gate(results, name):
    return next(r for r in results if r.gate == name)


def test_good_mesh_passes_structural_gates(cfg, printer):
    mesh = make_fixtures.good_figure()
    mesh.apply_scale(100.0 / mesh.extents[2])
    results = run_gates(mesh, cfg, printer)
    assert gate(results, "watertight").passed
    assert gate(results, "shell_count").passed
    assert gate(results, "positive_volume").passed


def test_floating_shells_fail_shell_gate(cfg, printer):
    mesh = make_fixtures.with_floating_shells(make_fixtures.good_figure())
    assert not gate(run_gates(mesh, cfg, printer), "shell_count").passed


def test_hole_fails_watertight_gate(cfg, printer):
    mesh = make_fixtures.with_hole(make_fixtures.good_figure())
    assert not gate(run_gates(mesh, cfg, printer), "watertight").passed


def test_thin_wall_fails_thickness_gate(cfg, printer):
    mesh = make_fixtures.with_thin_wall()
    r = gate(run_gates(mesh, cfg, printer), "min_wall_thickness")
    assert not r.passed
    assert "0.80 mm" in r.requirement


def test_failure_message_names_gate_and_fix(cfg, printer):
    mesh = make_fixtures.with_hole(make_fixtures.good_figure())
    with pytest.raises(ValidationFailure) as exc:
        validate(mesh, cfg, printer)
    msg = str(exc.value)
    assert "FAIL watertight" in msg
    assert "No mesh was written" in msg


def test_oversize_model_fails_plate_gate(cfg, printer):
    mesh = make_fixtures.good_figure()
    mesh.apply_scale(400.0 / mesh.extents[2])
    assert not gate(run_gates(mesh, cfg, printer), "fits_plate").passed
