# figurine-factory

A Python CLI that repairs a 3D mesh and refuses to export it until it passes eight print gates, plus a local dashboard for the runs it produces. For anyone turning AI-generated meshes into something a Bambu FDM printer can actually print.

Image-to-3D generators emit meshes that look fine on screen and fail in the slicer: non-manifold geometry, floating shells, sub-millimetre walls, no flat base. This automates the repair-and-check pass instead of doing it by hand in Blender.

[Design decisions](docs/decisions.md) - [Full spec](prd.md)

![The dashboard: run history on the left, the mesh viewer centre, three printer cards on the right. All run and printer data shown is seeded sample data, labelled MOCK DATA in the UI.](docs/img/dashboard.png)

Every screenshot in this README and in `docs/img/` shows seeded sample data, not real runs.

## Requirements

- Python 3.10 or newer, plus `make` for the shortcuts below
- Bun 1.4 or newer, for the dashboard only
- A 24 GB NVIDIA GPU on Linux, for local TRELLIS.2 generation only. `figurine repair` and `figurine validate` need no GPU, and generation is not wired up yet in any case
- No API keys or accounts. Nothing calls out to a network service

## Run it

```bash
git clone https://github.com/nvkudva/figurine-factory.git
cd figurine-factory
make dev                                      # editable install, dev deps, pre-commit hook
make fixtures                                 # generate the synthetic test meshes
make test
figurine repair tests/fixtures/thin_wall.stl --height 20
```

That mesh is deliberately broken, so the run should fail its gates, name the failing gate with the measured value and a fix, and write no STL. A mesh that passes gets `figurine.stl`, `manifest.json` and `report.md` under `out/<run_id>/`.

`figurine doctor` reports what this machine has against what the pipeline wants.

The dashboard:

```bash
cd webui
bun install
bun run seed        # sample rows, so the UI has something to show
bun run build
bun run api         # http://127.0.0.1:8757
```

`bun run seed` deletes every row in the database first, including runs published by `figurine publish`. It does not ask. Point it at a scratch database, or do not run it twice.

Push a real run into the dashboard with `figurine publish out/<run_id>`. The server binds to 127.0.0.1 only.

## How it works

`meshops/repair_ops.py` holds the mesh operations as independent functions - clean, drop small shells, fill holes, make manifold, orient, add a base, scale. `stages/repair.py` calls them in a fixed order driven by `configs/default.yaml`. `stages/validate.py` then runs eight gates (watertight, winding, shell count, positive volume, minimum wall thickness, plate fit, overhang area, base area) and evaluates all of them every time, so one run reports every problem rather than the first. Thresholds live in `configs/default.yaml` and `configs/printers/*.yaml`, never in code.

Each failure class carries its own exit code: `2` validation, `3` generation, `4` slicing, `5` intake, `6` repair.

`web/sqlite_sink.py` writes a run manifest into a SQLite file, and `webui/server/db.ts` reads that same file through the shared `src/figurine_factory/web/schema.sql`. That relative path means `webui/` cannot be moved away from the Python tree.

## Status

Working today: `figurine repair`, `figurine validate`, `figurine publish`, `figurine doctor`, and the dashboard reading published runs.

Not built: `figurine run` and `figurine replay` both exit immediately with a "not wired yet" message. `stages/stylize.py` raises `NotImplementedError` and `stages/generate.py` accepts only the `trellis2` backend name without implementing it. Slicing cannot succeed on a fresh clone - `configs/printers/profiles/` holds only a README, not the three Bambu Studio preset JSONs the code expects.

The 30-minutes-per-figurine and zero-manual-editing goals in `prd.md` are targets. Nothing has been measured against them, and no figurine has been printed from this pipeline.

Tests cover the repair operations, the gates, the SQLite sink and the privacy guard, against procedurally generated fixtures. The CLI, config loading, intake, slicing and reporting have no tests. Generation is untestable in CI, which has no GPU.

## Privacy

No photograph of a person may enter this repo, its history, or any test fixture. `scripts/check_no_photos.py` enforces that as a pre-commit hook and as a CI job that scans full history; subject photos belong in the gitignored `work/`. Hosted generator backends raise unless a run explicitly passes `allow_upload`, and `tests/test_privacy.py` holds that guard.

## License

MIT - see [LICENSE](LICENSE).
