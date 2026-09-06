"""The privacy constraint is code, not a policy document. These tests hold it."""
import pytest

from figurine_factory.errors import GenerationError
from figurine_factory.stages.generate import guard_upload
from scripts.check_no_photos import is_blocked


@pytest.mark.parametrize("backend", ["meshy", "tripo"])
def test_hosted_backends_refuse_without_explicit_flag(backend):
    with pytest.raises(GenerationError, match="uploads the reference image"):
        guard_upload(backend, allow_upload=False)


@pytest.mark.parametrize("backend", ["trellis2", "hunyuan3d"])
def test_local_backends_need_no_flag(backend):
    guard_upload(backend, allow_upload=False)


@pytest.mark.parametrize(
    "path",
    [
        "work/kai/photos/front.jpg",
        "out/abc123/reference.png",
        "src/figurine_factory/face.png",
        "docs/kid.jpeg",
    ],
)
def test_photo_paths_are_blocked_from_git(path):
    assert is_blocked(path) is not None


@pytest.mark.parametrize("path", ["src/figurine_factory/cli.py", "docs/img/report.png"])
def test_code_and_allowlisted_docs_pass(path):
    assert is_blocked(path) is None
