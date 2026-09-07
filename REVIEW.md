# Code review — figurine-factory

A Python CLI that repairs and gate-validates a 3D mesh into a print-ready figurine, plus a Bun/React dashboard that reads the same SQLite file the CLI writes; the generate, stylize and slice stages are declared but not wired.

Read: all of `src/figurine_factory/`, `scripts/`, `tests/`, `configs/`, `webui/server/`, `webui/src/api.ts|types.ts|App.tsx`, CI and hooks. Not read: `prd.md` beyond skimming, `webui/src/components/*` CSS and most component bodies, `webui/server/seed.ts` fixture data (lines 40–180), `bakeoff/`.

## Architecture

Three tiers, cleanly separated in the source layout.

**Geometry** — `meshops/repair_ops.py` holds seven independent `(mesh, …) -> (mesh, OpRecord)` functions; `meshops/stats.py:collect` snapshots a mesh; `meshops/thickness.py` estimates wall thickness by inward ray casting. None of these touch config, I/O or the CLI. This is the strongest layer in the repo.

**Stages** — `stages/repair.py:repair` is the only real orchestrator: it reads `cfg["repair"]` and calls the ops in a fixed order, returning a record. `stages/validate.py:run_gates` evaluates eight gates and always evaluates all of them, so one run reports every problem; `validate()` wraps it and raises `ValidationFailure`. `stages/generate.py`, `stylize.py` and `slice.py` are interface-and-guard only — `stylize.stylize` raises `NotImplementedError` (stylize.py:26) and `get_backend` raises for everything but `trellis2`.

**Entry point and state** — `cli.py` exposes `run`, `repair`, `validate`, `publish`, `doctor`, `replay`. `run` (cli.py:34) and `replay` (cli.py:145) exit immediately with "not wired yet", so `repair` is the only command that executes the pipeline. State lands in two places: a run directory (`out/<run_id>/manifest.json`, `figurine.stl`, `report.md`) written by `manifest.py` and `report.py`, and a SQLite file written by `web/sqlite_sink.py:publish`. The two are one-directional — the sink reads a manifest and never writes back.

**The cross-language boundary** is `src/figurine_factory/web/schema.sql`, read by `sqlite_sink.py:13` and again by `webui/server/db.ts:6` through the relative path `../../src/figurine_factory/web/schema.sql`. One definition, both sides — the right call. `webui/server/db.ts` returns typed rows, `printers.ts:listPrinters` derives progress from elapsed time rather than storing it, and `webui/server/index.ts` binds to `127.0.0.1` and serves five routes.

What the structure gets right: the gates are pure functions over a mesh and a config dict, so `tests/test_validate.py` exercises every one of them without a GPU or a printer; thresholds genuinely live in YAML; `run_gates`/`validate` split lets `figurine validate` score a mesh without the raise path.

Where it will hurt:

- `cli.py:46-84` is the whole pipeline inlined into one command — config load, run-dir creation, mesh load, repair, validate, export, manifest write, report write, and the mapping of two exception types onto two exit codes. When `run` is wired it must repeat all of it or be refactored first. There is no `pipeline.py` for `run` to call.
- `config.repo_root()` is `Path(__file__).resolve().parents[2]` (config.py:11), so the package only finds `configs/` when it sits inside a checkout. `make install` uses `-e`, which hides this; a non-editable `pip install .` produces a `figurine` binary that cannot load its own defaults, because `configs/` is not in `[tool.setuptools.packages.find]`.
- `webui/server/db.ts` exports `RunSummary` and `RunDetail` types (db.ts:145-146) that `webui/src/types.ts` re-declares by hand. Two definitions of the same wire shape, and only the server's is derived from the query.
- `webui/` cannot be deployed or copied without the Python tree beside it, because of the `../../src/...` schema path.

## Code quality

Error handling is deliberate where it exists: `errors.py` gives each failure a distinct exit code, `ValidationFailure.render` names gate, measurement, requirement and fix, and `slice.py:verify_gcode` refuses to trust exit code 0. Types are annotated throughout and the TypeScript side runs `strict` with `noUncheckedIndexedAccess`. No secrets anywhere; the server and Vite both bind to loopback with a comment saying why. The privacy guard is real code with tests (`scripts/check_no_photos.py`, `tests/test_privacy.py`) and a CI job that scans full history.

Concrete problems:

- **Dead config.** `configs/default.yaml` declares eight keys that no code reads: `subject_alias` (line 2), `intake.strip_exif`, `generate.target_faces`, `repair.thicken_thin_walls` (line 24), `repair.base.chamfer_mm` (line 29), `validate.max_open_boundary_loops`, `min_feature_size_mm`, `min_base_flatness_frac`, `max_self_intersections` (lines 43-49). A reader tuning `min_feature_size_mm` gets no effect and no error.
- **The docstring describes a step that does not exist.** `repair_ops.py:3-4` documents the order as "clean -> shells -> holes -> manifold -> **thicken** -> orient -> base -> scale". There is no thicken op and `repair.py` never calls one.
- **`rounded_square` is a plain box.** `repair_ops.py:220-223` branches on `cylinder`, and everything else falls through to `trimesh.creation.box`. `chamfer_mm` is never applied.
- **Duplicated computation.** `stats.py:34-44` runs `np.unique(edges, axis=0, return_counts=True)` twice over the same array and discards the first result. On a 300k-face mesh that is a wasted sort of ~900k rows.
- **NaN escapes into JSON.** `stats.collect` sets `volume_mm3=float("nan")` for a non-watertight mesh (stats.py:72), and `Manifest.write` (manifest.py:60) serialises it with `json.dumps`, which emits the bare token `NaN`. The pre-repair snapshot of generator output is almost always non-watertight, so this is the normal path, not an edge case. `json.loads` accepts it, so `publish` works; any strict JSON reader does not. `sqlite_sink._finite` already handles the DB side — the manifest itself is the gap.
- **Overhang gate counts the base.** `validate.py:77-80` sums the area of every face with `nz < cos(135°)`, which includes the plinth's bottom face — the one resting on the plate. Every based model pays an overhang penalty it does not owe, and the fraction is not comparable between based and unbased meshes.
- **Two sources for one threshold.** `validate.py:35` reads `max_overhang_angle_deg` from the printer profile; `repair.py:36-41` calls `orient_for_printing` without it, so the orientation search optimises against the hardcoded `45.0` default (repair_ops.py:168). Change the printer profile and repair and validation disagree.
- **Quadratic hole filling.** `repair_ops.py:114-118` constructs a whole new `Trimesh` from `np.vstack` of the full vertex and face arrays once per hole. Ten holes on a large mesh means ten full copies.
- **Test coverage is narrow but honest.** 5 Python test files cover repair ops, gates, the sink and the privacy guard, with fixtures that are genuinely procedural (`tests/fixtures/make_fixtures.py`). Untested: `cli.py`, `config.py` (including the `repo_root` assumption), `intake.py`, `slice.py`, `doctor.py`, `report.py` and `thickness.py` as a unit. `webui/tsconfig.json` `include` omits `test`, so `bunx tsc --noEmit` in CI does not typecheck the test file it then runs.
- **Dependency hygiene.** `pymeshlab>=2023.12` is a hard runtime dependency in `pyproject.toml:11` but is never imported — only its version string is read (`manifest.py:31`). It is also the heaviest wheel in the list and is GPL-licensed, against an MIT `LICENSE`.
- **Lint config is thinner than it looks.** `[tool.ruff]` sets only `line-length` and `target-version`, so the default `E`/`F` rules apply. `sqlite_sink.py:88` carries `# noqa: PLW2901` for a rule that is not enabled.

## Risks

- **`bun run seed` destroys published runs.** `webui/server/seed.ts:216-219` runs `DELETE FROM` on `gates, stats, ops, stages, printers, runs` against `openDb()`, which defaults to `webui/figurine.db` — the same file `figurine publish` writes (cli.py:109). Nothing prompts, and nothing checks whether the existing rows are seeded or real.
- **Unbounded validation runtime.** `validate.py:62` calls `min_wall_thickness` with the default 20,000 samples, each a ray cast against the full mesh. Without an accelerated backend (`embree`/`pyembree`, neither declared) this is pure-Python BVH traversal on a mesh the config sizes at 300k faces. There is no face cap, no timeout, and no progress output — the gate that matters most is the one most likely to appear to hang.
- **No timeout on the slicer.** `slice.py:40` calls `subprocess.run` with no `timeout`. A hung Bambu Studio hangs `figurine run` forever.
- **Fragile slicer profile paths.** `slice.py:30` builds the settings argument by taking `printer['machine_settings'].split('/')[-1]` and re-joining it under `_profile_dir`. Any profile path with a different shape, or a Windows separator, silently resolves to the wrong file and the slicer is handed a preset the operator did not choose. `configs/printers/profiles/` also contains only a README — the three JSON presets the code requires are not in the repo, so `slice_3mf` cannot succeed on a fresh clone.
- **Untyped crash in the base op.** `repair_ops.py:217` assigns the result of `slice_plane` directly. `trimesh` returns `None` when the cut removes everything, and the next line dereferences it — an `AttributeError` escapes `cli.py`'s `except FigurineError` and produces a traceback instead of a named failure with an exit code.
- **`figurine publish` writes to a cwd-relative default.** `cli.py:109` defaults `--db` to `webui/figurine.db`. Run from anywhere but the repo root it silently creates a second database that the dashboard never reads.
- **Licence.** MIT `LICENSE` with a GPL `pymeshlab` in `dependencies`. Since nothing imports it, removing it is both a size win and the licence fix.

## Action items

| Priority | Item | File | Why |
| --- | --- | --- | --- |
| P0 | Refuse to wipe non-seeded rows in `seed()`, or make it require an explicit `--force` / a separate DB path | `webui/server/seed.ts:216` | One `bun run seed` deletes every run published by `figurine publish` from the default database |
| P0 | Drop `pymeshlab` from `dependencies` (nothing imports it) or move it to an optional extra | `pyproject.toml:11` | GPL dependency shipped under an MIT licence, for a version string |
| P1 | Serialise NaN/inf as `null` in the manifest (`json.dumps(..., allow_nan=False)` after sanitising, or reuse `_finite`) | `src/figurine_factory/manifest.py:60` | `manifest.json` is invalid JSON on the common non-watertight path; it is the reproducibility artifact |
| P1 | Package `configs/` with the distribution and resolve it via `importlib.resources`, not `parents[2]` | `src/figurine_factory/config.py:11` | A non-editable install produces a `figurine` binary that cannot load its own defaults |
| P1 | Exclude bed-contact faces from the overhang sum, or measure overhang before `add_base` | `src/figurine_factory/stages/validate.py:77-80` | The plinth's underside is counted as overhang, so the gate penalises every based model |
| P1 | Pass the printer's `max_overhang_angle_deg` into `orient_for_printing` | `src/figurine_factory/stages/repair.py:36-41` | Orientation optimises against a hardcoded 45° while validation uses the profile value |
| P1 | Cap the sample count (or decimate) before ray casting, and declare the accelerated ray backend | `src/figurine_factory/stages/validate.py:62` | 20k ray casts against a 300k-face mesh with no cap, timeout or progress |
| P1 | Add `timeout=` to the Bambu Studio call and raise `SliceError` on expiry | `src/figurine_factory/stages/slice.py:40` | A hung slicer hangs the whole pipeline with no recovery |
| P1 | Guard `slice_plane` returning `None` and raise `RepairError` | `src/figurine_factory/meshops/repair_ops.py:217` | `AttributeError` bypasses the typed-error handling in `cli.py` and prints a traceback |
| P1 | Either implement the four unread `validate.*` thresholds or delete them | `configs/default.yaml:43-49` | `max_open_boundary_loops`, `min_feature_size_mm`, `min_base_flatness_frac`, `max_self_intersections` silently do nothing |
| P1 | Extract the repair→validate→export→manifest sequence out of `repair_cmd` into a `pipeline` function | `src/figurine_factory/cli.py:46-84` | `run` will otherwise duplicate the whole body, including the error-to-exit-code mapping |
| P2 | Import `RunSummary`/`RunDetail` from the server instead of re-declaring them | `webui/src/types.ts:1` | Two hand-maintained definitions of one wire shape; only the server's is query-derived |
| P2 | Implement the chamfer, or rename `rounded_square` to `square` and drop `chamfer_mm` | `src/figurine_factory/meshops/repair_ops.py:220-223` | The named shape and its config key produce a plain box |
| P2 | Remove the duplicate `np.unique` call | `src/figurine_factory/meshops/stats.py:34-44` | The same sort over the edge array runs twice per snapshot, twice per run |
| P2 | Fill all holes in one rebuild instead of one `Trimesh` construction per hole | `src/figurine_factory/meshops/repair_ops.py:114` | Full vertex/face array copy per hole on meshes sized for 300k faces |
| P2 | Correct the op order in the module docstring — there is no thicken step | `src/figurine_factory/meshops/repair_ops.py:3-4` | Documents behaviour the pipeline does not have |
| P2 | Add `"test"` to `include` | `webui/tsconfig.json` | CI typechecks then runs a file it never typechecked |
| P2 | Enable an explicit ruff rule set (`select = ["E","F","I","UP","B","PL"]`) | `pyproject.toml:26` | Defaults are `E`/`F` only; an existing `# noqa: PLW2901` suppresses a rule that is not on |
| P2 | Commit the three Bambu preset JSONs, or make `find_bambu_studio`/`slice_3mf` fail with a message naming the missing files | `configs/printers/profiles/` | The directory holds only a README, so slicing cannot work from a fresh clone |
| P2 | Resolve `--db` against a fixed root, or error when the parent directory does not exist | `src/figurine_factory/cli.py:109` | A cwd-relative default silently creates a database the dashboard never reads |
