"""Score the bake-off from scorecard.csv using the PRD section 8 weights."""
from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

WEIGHTS = {
    "slicer_pass": 0.30,
    "watertight": 0.20,
    "repair_minutes": 0.25,
    "likeness": 0.15,
    "style_consistency": 0.10,
}
MAX_REPAIR_MIN = 90.0  # anything at or above this scores zero on that criterion


def norm_repair(minutes: float) -> float:
    return max(0.0, 1.0 - minutes / MAX_REPAIR_MIN)


def main(path: Path = Path(__file__).parent / "scorecard.csv") -> None:
    rows = [r for r in csv.DictReader(path.open()) if r.get("slices_unedited")]
    if not rows:
        print("scorecard.csv has no scored rows yet — run the bake-off first.")
        return

    by_backend: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_backend[r["backend"]].append(r)

    print(f"{'backend':<12} {'slice':>6} {'water':>6} {'repair':>7} {'like':>5} {'style':>6} {'TOTAL':>7}")
    results = []
    for backend, rs in by_backend.items():
        n = len(rs)
        slicer = sum(r["slices_unedited"].strip().lower() in ("1", "true", "yes") for r in rs) / n
        water = sum(r["watertight"].strip().lower() in ("1", "true", "yes") for r in rs) / n
        repair = sum(norm_repair(float(r["manual_repair_min"])) for r in rs) / n
        like = sum(float(r["likeness_1_5"]) for r in rs) / n / 5
        style = sum(float(r["style_consistency_1_5"]) for r in rs) / n / 5
        total = (
            WEIGHTS["slicer_pass"] * slicer
            + WEIGHTS["watertight"] * water
            + WEIGHTS["repair_minutes"] * repair
            + WEIGHTS["likeness"] * like
            + WEIGHTS["style_consistency"] * style
        )
        results.append((total, backend))
        print(f"{backend:<12} {slicer:>6.2f} {water:>6.2f} {repair:>7.2f} {like:>5.2f} {style:>6.2f} {total:>7.3f}")

    print(f"\nwinner: {max(results)[1]} ({max(results)[0]:.3f})")


if __name__ == "__main__":
    main()
