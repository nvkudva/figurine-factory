# Milestone 1 — generator bake-off

Vendor claims are hypotheses. Meshy's "97% slicer pass rate on figurines" and Tripo's
"auto-repair, clean topology" get tested here, on the same three inputs, scored the same way.

## Rules

1. **Reference images are synthetic or public-domain faces.** Never the child's photos.
   Sending his likeness to three vendors to compare them defeats the point of the project.
   Likeness is judged separately, on the local winner, locally.
2. Same three references, same target height (100 mm), same printer profile for every entrant.
3. Raw output is scored **before** any repair — that is the number that matters, because
   repair minutes are the cost being measured.
4. Every hosted account's assets are deleted afterwards, and the deletion is logged in
   `deletion_log.md` with date and method.

## Entrants

| Backend | Where | Licence |
| --- | --- | --- |
| TRELLIS.2 | local (needs ≥ 24 GB VRAM) | MIT |
| Hunyuan3D 2.1 | local | Tencent Hunyuan Community License |
| Meshy | hosted | commercial ToS |
| Tripo | hosted | commercial ToS |

## Method

```bash
python tests/fixtures/make_fixtures.py          # sanity-check the gates first
figurine validate bakeoff/runs/<backend>/<ref>.glb   # raw-output score, no repair
```

Then time the manual repair to first sliceable mesh with a stopwatch. Record in
`scorecard.csv`. Write the verdict, with numbers, in the top-level README.
