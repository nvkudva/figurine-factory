# Open decisions

Three choices block the **generate** stage. None of them block repair, validate or slice —
those are built first against synthetic fixtures, which is why the scaffold works today.

---

## D1 — Local GPU vs hosted generation

**Status:** open. Blocks `stages/generate.py`.

The privacy constraint points one way, the hardware points the other.

| Option | For | Against |
| --- | --- | --- |
| **Local, TRELLIS.2** | MIT licence. Nothing leaves the machine. 4B params, PBR output, sharp features. | Needs **≥ 24 GB VRAM**, verified on A100/H100, **Linux only**, CUDA 12.4. Single-image input. |
| **Local, Hunyuan3D 2.1** | Runs in less VRAM than TRELLIS.2. Strong on characters. | **Not MIT** — Tencent Hunyuan Community License, with a 1M-MAU commercial trigger and EU restrictions. Fine for family use; read it before assuming otherwise. |
| **Cloud GPU, local model** | 24 GB on demand, no vendor sees the model weights or the pipeline. | The stylized reference still lands on someone else's disk. Mitigated if the reference is already cartoonised past recognition. |
| **Hosted (Meshy/Tripo)** | No hardware. Meshy claims a 97% figurine slicer pass rate and ships Bambu 3MF. | Uploads the child's likeness. Ruled out for steady state; bake-off only, on synthetic faces. |

**What decides it:** the GPU in the machine. Check `nvidia-smi` before anything else.

**Recommendation if you want a default:** TRELLIS.2 locally when there is ≥ 24 GB VRAM;
otherwise a rented GPU running TRELLIS.2, fed a stylized reference rather than a photo,
so no recognisable image of the child touches a third-party disk.

---

## D2 — Single stylized reference vs multi-view input

**Status:** open. Blocks `stages/stylize.py`.

TRELLIS.2's documented workflow is **single-image**. Multi-view would use the photos more
faithfully but does not match the tool.

- **Single stylized reference** (simpler): 3–5 photos condense into one cartoon image, and
  that image drives everything. Style consistency is trivial because one preset governs one
  image. Likeness depends entirely on that image being good. It is also the privacy-friendlier
  path: one already-stylized image, not five photographs.
- **Multi-view**: better geometry on the back of the head, harder style consistency, and a
  generator that may not accept it.

**Recommendation:** single stylized reference for v1. It matches the tool, keeps the style
preset meaningful, and reduces what a hosted step could ever see. Revisit if the backs of
heads come out wrong.

---

## D3 — Resin detail vs FDM convenience

**Status:** open. Sets `min_wall_thickness` and the whole validation profile.

- **FDM (Bambu, 0.4 mm nozzle)**: 0.8 mm minimum wall, ~1.2 mm minimum feature. Chunky style
  needed. No post-processing, no chemicals, no washing station, print and hand it over.
  A 100 mm figurine takes hours, not a day.
- **Resin**: 0.3 mm walls, real facial detail. Also IPA, gloves, UV curing, and a fragile
  print — for a child's toy that gets dropped, brittle resin is a poor material.

**Recommendation:** FDM. The stated goal is 30 minutes of *your* time per figurine, and resin
adds a wash-and-cure step that eats it. Keep the printer profile abstract enough that a resin
profile is a config file, not a rewrite — the scaffold already does this.
