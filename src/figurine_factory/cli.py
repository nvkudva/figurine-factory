"""figurine — one command from a photo folder to a sliced 3MF."""
from __future__ import annotations

import json
from pathlib import Path

import typer
from rich.console import Console

from . import config as cfgmod
from . import manifest as manifestmod
from . import report as reportmod
from .errors import FigurineError, ValidationFailure
from .stages import repair as repair_stage
from .stages import validate as validate_stage

app = typer.Typer(add_completion=False, help=__doc__)
console = Console()


@app.command()
def run(
    photos: Path = typer.Argument(..., help="Folder of 3-5 photos (kept outside the repo)."),
    style: str = typer.Option("chibi_vinyl", help="Named style preset."),
    height: float = typer.Option(100.0, help="Target figurine height in mm."),
    printer: str = typer.Option("bambu_p1s_0.4", help="Printer profile name."),
    backend: str = typer.Option(None, help="Generator backend override."),
    allow_upload: bool = typer.Option(
        False, help="Permit a hosted generator. Synthetic images only — never family photos."
    ),
    out: Path = typer.Option(Path("out"), help="Output root."),
):
    """Full pipeline: intake -> stylize -> generate -> repair -> validate -> slice."""
    raise typer.Exit(_not_yet("run", "generation backends are blocked on decision D1"))


@app.command("repair")
def repair_cmd(
    mesh_path: Path = typer.Argument(..., help="Raw mesh from any generator (GLB/OBJ/STL/PLY)."),
    height: float = typer.Option(100.0, help="Target figurine height in mm."),
    printer: str = typer.Option("bambu_p1s_0.4"),
    out: Path = typer.Option(Path("out"), help="Output root."),
    config_file: Path = typer.Option(None, "--config"),
):
    """Repair and validate an existing mesh. Usable before the generator is chosen."""
    cfg = cfgmod.load_config(config_file)
    cfg["repair"]["scale"]["target_height_mm"] = height
    printer_cfg = cfgmod.load_printer(printer)

    mf = manifestmod.Manifest(config=cfg)
    run_dir = out / mf.run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    try:
        mesh = repair_stage.load_mesh(mesh_path)
        console.print(f"[dim]loaded[/] {mesh_path} — {len(mesh.faces):,} faces")

        repaired, record = repair_stage.repair(mesh, cfg["repair"])
        mf.stage("repair", **record)
        mf.mesh_stats = {"before": record["before"], "after": record["after"]}

        gates = validate_stage.validate(repaired, cfg["validate"], printer_cfg)
        mf.gates = [g.to_dict() for g in gates]
        mf.outcome = "pass"

        stl = run_dir / "figurine.stl"
        repaired.export(stl)
        console.print(f"[green]PASS[/] {len(gates)} gates -> {stl}")

    except ValidationFailure as e:
        mf.gates = [g.to_dict() for g in e.failures]
        mf.outcome = "validation_failed"
        mf.failure_reason = str(e)
        console.print(f"[red]{e}[/]")
        _finish(mf, run_dir)
        raise typer.Exit(e.exit_code)
    except FigurineError as e:
        mf.outcome = "error"
        mf.failure_reason = str(e)
        console.print(f"[red]{e}[/]")
        _finish(mf, run_dir)
        raise typer.Exit(e.exit_code)

    _finish(mf, run_dir)


@app.command()
def validate(
    mesh_path: Path = typer.Argument(...),
    printer: str = typer.Option("bambu_p1s_0.4"),
    config_file: Path = typer.Option(None, "--config"),
):
    """Run the gates on a mesh without changing it. Use it to score generator output."""
    cfg = cfgmod.load_config(config_file)
    printer_cfg = cfgmod.load_printer(printer)
    mesh = repair_stage.load_mesh(mesh_path)
    results = validate_stage.run_gates(mesh, cfg["validate"], printer_cfg)
    for r in results:
        mark = "[green]pass[/]" if r.passed else "[red]FAIL[/]"
        console.print(f"{mark} {r.gate}: {r.measured} (needs {r.requirement})")
        if not r.passed and r.hint:
            console.print(f"      [dim]{r.hint}[/]")
    raise typer.Exit(0 if all(r.passed for r in results) else 2)


@app.command()
def publish(
    run_dir: Path = typer.Argument(..., help="A run directory containing manifest.json."),
    db: Path = typer.Option(Path("webui/figurine.db"), help="SQLite file the web UI reads."),
):
    """Publish a completed run into the web UI's database."""
    from .web.sqlite_sink import publish as publish_run

    manifest = run_dir / "manifest.json" if run_dir.is_dir() else run_dir
    if not manifest.exists():
        console.print(f"[red]no manifest at {manifest}[/]")
        raise typer.Exit(1)
    run_id = publish_run(manifest, db)
    console.print(f"[green]published[/] {run_id} -> {db}")


@app.command()
def doctor():
    """Check this machine against what the pipeline needs. Run it before milestone 1."""
    from . import doctor as doc

    checks = doc.run_checks()
    for c in checks:
        mark = "[green]ok  [/]" if c.ok else "[red]MISS[/]"
        console.print(f"{mark} {c.name}: {c.detail}")
        if not c.ok and c.blocking:
            console.print(f"      [dim]blocks {c.blocking}[/]")
    blocked = [c for c in checks if not c.ok and c.blocking]
    if blocked:
        console.print(f"\n[yellow]{len(blocked)} prerequisite(s) missing.[/] "
                      "Repair and validation still run — that is the point of the split.")
    raise typer.Exit(0 if not blocked else 1)


@app.command()
def replay(manifest_path: Path = typer.Argument(...)):
    """Re-execute a recorded run with its exact settings and seeds."""
    data = manifestmod.Manifest.read(manifest_path)
    console.print(json.dumps({k: data[k] for k in ("run_id", "git_sha", "style", "generator")}, indent=2))
    raise typer.Exit(_not_yet("replay", "needs the generate stage"))


def _finish(mf: manifestmod.Manifest, run_dir: Path) -> None:
    mf.write(run_dir / "manifest.json")
    if mf.mesh_stats:
        reportmod.write_report(
            run_dir / "report.md", mf.__dict__, mf.mesh_stats["before"], mf.mesh_stats["after"], mf.gates
        )
    console.print(f"[dim]manifest + report ->[/] {run_dir}")


def _not_yet(cmd: str, why: str) -> int:
    console.print(f"[yellow]`figurine {cmd}` is not wired yet: {why}. See docs/decisions.md.[/]")
    return 1


if __name__ == "__main__":
    app()
