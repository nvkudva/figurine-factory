import pytest
import trimesh

from figurine_factory.meshops import repair_ops
from tests.fixtures import make_fixtures


@pytest.fixture(scope="module")
def good():
    return make_fixtures.good_figure()


def test_keep_main_shell_drops_debris(good):
    dirty = make_fixtures.with_floating_shells(good)
    assert len(dirty.split(only_watertight=False)) > 1
    cleaned, record = repair_ops.keep_main_shell(dirty)
    assert len(cleaned.split(only_watertight=False)) == 1
    assert record.detail["dropped"] == 4


def test_fill_holes_restores_watertight(good):
    holey = make_fixtures.with_hole(good)
    assert not holey.is_watertight
    filled, _ = repair_ops.fill_holes(holey)
    assert filled.is_watertight


def test_scale_to_height_is_exact(good):
    scaled, record = repair_ops.scale_to_height(good, 100.0)
    assert scaled.extents[2] == pytest.approx(100.0, rel=1e-6)
    assert record.detail["to_mm"] == 100.0


def test_scale_rejects_flat_mesh():
    flat = trimesh.creation.box(extents=[10, 10, 0])
    with pytest.raises(ValueError, match="zero height"):
        repair_ops.scale_to_height(flat)


def test_base_sits_on_z_zero(good):
    based, _ = repair_ops.add_base(good, height_mm=3.0)
    assert based.bounds[0][2] == pytest.approx(0.0, abs=1e-6)


def test_orientation_is_deterministic(good):
    a, _ = repair_ops.orient_for_printing(good, candidates=8)
    b, _ = repair_ops.orient_for_printing(good, candidates=8)
    assert a.bounds == pytest.approx(b.bounds)
