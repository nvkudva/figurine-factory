"""Human-readable per-run report."""
from __future__ import annotations

from pathlib import Path

from .meshops.stats import MeshStats, diff_table


def write_report(out: Path, manifest: dict, before: dict, after: dict, gates: list) -> Path:
    b, a = MeshStats(**{k: v for k, v in before.items()}), MeshStats(**{k: v for k, v in after.items()})
    lines = [
        f"# Run {manifest['run_id']} — {manifest['subject_alias']}",
        "",
        f"Outcome: **{manifest['outcome']}**  ·  style: `{manifest.get('style', {}).get('preset', '?')}`"
        f"  ·  generator: `{manifest.get('generator', {}).get('backend', '?')}`",
        "",
        "## Mesh before / after repair",
        "",
        diff_table(b, a),
        "",
        "## Repair operations",
        "",
        "| op | changed | detail |",
        "| --- | --- | --- |",
    ]
    for op in manifest.get("stages", {}).get("repair", {}).get("operations", []):
        lines.append(f"| {op['op']} | {op['changed']} | `{op['detail']}` |")

    lines += ["", "## Validation gates", "", "| gate | result | measured | requirement |", "| --- | --- | --- | --- |"]
    for g in gates:
        mark = "pass" if g["passed"] else "**FAIL**"
        lines.append(f"| {g['gate']} | {mark} | {g['measured']} | {g['requirement']} |")

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n")
    return out
