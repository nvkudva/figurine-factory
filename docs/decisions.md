# Decisions

Three choices blocked the **generate** stage. All three are now **decided** (2026-09-06).
Repair, validate and slice were built first against synthetic fixtures, so none of this
blocked the work that carries the value.

---

## D1 — Local GPU vs hosted generation — **DECIDED: local TRELLIS.2**

The privacy constraint decides it, and TRELLIS.2 is the only entrant that satisfies it
without a licence caveat.

| Option | For | Against |
| --- | --- | --- |
| **TRELLIS.2 (chosen)** | MIT. Nothing leaves the machine. 4B params, PBR output, sharp features. | Needs **≥ 24 GB VRAM**, verified on A100/H100, **Linux only**, CUDA 12.4. |
| Hunyuan3D 2.1 | Less VRAM. Strong on characters. | Tencent Hunyuan Community License, not MIT — 1M-MAU commercial trigger, EU restrictions. |
| Rented GPU, local model | 24 GB on demand. | The stylized reference still lands on someone else's disk. |
| Hosted (Meshy/Tripo) | No hardware. Meshy claims 97% figurine slicer pass rate. | Uploads the child's likeness. Bake-off only, on synthetic faces. |

**Consequences**
- `configs/default.yaml` keeps `generate.backend: trellis2`, `allow_upload: false`.
- Hardware is now a hard prerequisite: run `figurine doctor` before milestone 1.
- **Fallback if the local GPU is under 24 GB:** rent a GPU and feed it the *stylized*
  reference, never a photograph. Hunyuan3D 2.1 is the second fallback — read its licence first.
- Hosted generators stay bake-off-only, on synthetic faces, with assets deleted afterwards.

---

## D2 — Single stylized reference vs multi-view — **DECIDED: single stylized reference**

It matches TRELLIS.2's documented single-image workflow, it makes the style preset
meaningful (one preset governs one image, so a set matches), and it exposes one
already-cartoonised image instead of five photographs.

**Consequences**
- `stages/stylize.py` condenses 3–5 photos into exactly one reference image.
- Style consistency across a set is a property of the preset hash, and is testable.
- **Accepted risk:** the back of the head is inferred, not observed. If that comes out
  wrong on real subjects, revisit — TRELLIS.2 would need a multi-view path first.
- **Still open, one level down:** which model does the stylizing. The preset pins
  `sdxl-turbo` as a placeholder. Settle it during milestone 1, locally, same constraint.

---

## D3 — Resin vs FDM — **DECIDED: FDM on the Bambu**

The goal is 30 minutes of *my* time per figurine. Resin adds washing, curing and gloves,
which eats that budget, and a brittle print is the wrong material for a toy a child drops.

**Consequences**
- Validation runs the FDM profile: **0.8 mm** minimum wall (2 × 0.4 mm nozzle), 1.2 mm
  minimum feature. Already the default in `configs/printers/bambu_p1s_0.4.yaml`.
- The style preset must stay chunky: thick limbs, fused hair, no thin props.
- A resin profile stays a config file, not a rewrite — the printer profile is already
  abstract. Revisit only if likeness at 100 mm proves unacceptable on FDM.
