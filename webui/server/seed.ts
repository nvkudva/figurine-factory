/**
 * Mock runs, so the UI can be built and judged before the generate stage exists.
 *
 * The data is deliberately unflattering: half of these fail. A dashboard that has only
 * ever rendered successes hides the screen this project cares most about — the one that
 * says which gate stopped a figurine and what to do about it.
 *
 * Gates are derived from each run's own post-repair statistics, so the sample data
 * cannot contradict itself. A 70 mm run must not report a 100 mm bounding box.
 *
 * Run: bun run seed
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DB_PATH, openDb } from "./db.ts";

const FIXTURES = join(import.meta.dir, "../../tests/fixtures");
const HOUR = 3600;

interface Gate {
  gate: string;
  passed: boolean;
  measured: string;
  requirement: string;
  hint?: string;
}

interface Stats {
  vertices: number;
  faces: number;
  shells: number;
  watertight: boolean;
  open_boundary_loops: number;
  min_wall_mm: number | null;
  /** null when the mesh is not watertight — volume is genuinely undefined there. */
  volume_mm3: number | null;
  bbox: [number, number, number];
}

type GateOverrides = Partial<Record<string, Partial<Gate>>>;

function gatesFor(after: Stats, overhang: string, over: GateOverrides = {}): Gate[] {
  const wall = after.min_wall_mm ?? 0;
  const overhangFrac = Number.parseFloat(overhang) / 100;
  const base: Gate[] = [
    { gate: "watertight", passed: after.watertight,
      measured: after.watertight ? "True" : "False", requirement: "True" },
    { gate: "winding_consistent", passed: true, measured: "True", requirement: "True" },
    { gate: "shell_count", passed: after.shells <= 1,
      measured: String(after.shells), requirement: "<= 1" },
    { gate: "positive_volume", passed: after.volume_mm3 !== null,
      measured: after.volume_mm3?.toFixed(1) ?? "nan", requirement: "> 0 and finite" },
    { gate: "min_wall_thickness", passed: wall >= 0.8,
      measured: `${wall.toFixed(2)} mm`, requirement: ">= 0.80 mm" },
    { gate: "fits_plate", passed: after.bbox.every((v) => v <= 256),
      measured: `[${after.bbox.map((v) => v.toFixed(1)).join(", ")}]`,
      requirement: "<= [256, 256, 256]" },
    { gate: "overhang_area", passed: overhangFrac <= 0.25,
      measured: overhang, requirement: "<= 25%" },
    { gate: "base_area", passed: true, measured: "100.0%", requirement: ">= 8%" },
  ];
  return base.map((g) => ({ ...g, ...(over[g.gate] ?? {}) }));
}

const OPS = [
  { op: "clean", changed: true, detail: { before: [9264, 3088], after: [1554, 3088] } },
  { op: "keep_main_shell", changed: true, detail: { shells_before: 5, shells_after: 1, dropped: 4 } },
  { op: "fill_holes", changed: true, detail: { watertight_before: false, watertight_after: true, holes_filled: 3, holes_too_large_mm: [], max_perimeter_mm: 25 } },
  { op: "make_manifold", changed: true, detail: { method: "local" } },
  { op: "orient", changed: true, detail: { score: 0.0323, candidates: 64 } },
  { op: "add_base", changed: true, detail: { shape: "rounded_square", height_mm: 3, method: "boolean union" } },
  { op: "scale", changed: true, detail: { from_mm: 88.145, to_mm: 100, factor: 1.13449 } },
];

const STAGES = [
  { name: "intake", at: 1.2, detail: { photos: 4 } },
  { name: "stylize", at: 22.8, detail: { preset: "chibi_vinyl" } },
  { name: "generate", at: 118.4, detail: { backend: "trellis2" } },
  { name: "repair", at: 138.1, detail: {} },
  { name: "validate", at: 141.0, detail: {} },
  { name: "slice", at: 152.6, detail: { gcode_present: true } },
];

interface Seed {
  run_id: string;
  alias: string;
  outcome: string;
  style: string;
  backend: string;
  height: number;
  ageHours: number;
  before: Stats | null;
  after: Stats | null;
  overhang: string;
  gateOverrides?: GateOverrides;
  ops: typeof OPS;
  stages: typeof STAGES;
  failure?: string;
  mesh?: string;
}

const RUNS: Seed[] = [
  {
    run_id: "ad80ffb135a9", alias: "subject-a", outcome: "pass", style: "chibi_vinyl",
    backend: "trellis2", height: 100, ageHours: 2, overhang: "17.1%",
    before: { vertices: 9264, faces: 3088, shells: 5, watertight: false, open_boundary_loops: 1, min_wall_mm: 2.26, volume_mm3: null, bbox: [51.2, 32.0, 86.0] },
    after: { vertices: 1415, faces: 2826, shells: 1, watertight: true, open_boundary_loops: 0, min_wall_mm: 3.403, volume_mm3: 65231.1, bbox: [43.2, 43.2, 100.0] },
    ops: OPS, stages: STAGES, mesh: "good_figure.stl",
  },
  {
    // Thin extremities at 70 mm: the failure this whole project exists to catch.
    run_id: "c71e04b8fa22", alias: "subject-a", outcome: "validation_failed",
    style: "chibi_vinyl", backend: "trellis2", height: 70, ageHours: 5.5, overhang: "19.8%",
    before: { vertices: 11402, faces: 4210, shells: 7, watertight: false, open_boundary_loops: 3, min_wall_mm: 0.29, volume_mm3: null, bbox: [38.0, 24.1, 61.2] },
    after: { vertices: 2103, faces: 3944, shells: 1, watertight: true, open_boundary_loops: 0, min_wall_mm: 0.41, volume_mm3: 22781.4, bbox: [30.2, 30.2, 70.0] },
    gateOverrides: {
      min_wall_thickness: {
        measured: "0.41 mm at 1848 sites",
        hint: "scale the figurine taller with --height, or use a style preset with chunkier extremities (thicker limbs, fused hair)",
      },
    },
    ops: OPS, stages: STAGES, mesh: "thin_wall.stl",
    failure: "FAIL min_wall_thickness: 0.41 mm at 1848 sites, needs >= 0.80 mm",
  },
  {
    // Debris the base union could not reconcile: shells and volume both fail.
    run_id: "5b2a9c1d77e0", alias: "subject-b", outcome: "validation_failed",
    style: "chibi_vinyl", backend: "meshy", height: 100, ageHours: 26, overhang: "22.5%",
    before: { vertices: 24880, faces: 9102, shells: 14, watertight: false, open_boundary_loops: 9, min_wall_mm: 0.88, volume_mm3: null, bbox: [62.4, 41.0, 91.7] },
    after: { vertices: 6640, faces: 8801, shells: 4, watertight: false, open_boundary_loops: 2, min_wall_mm: 0.94, volume_mm3: null, bbox: [44.0, 44.0, 100.0] },
    gateOverrides: {
      shell_count: { hint: "lower repair.min_shell_volume_frac to drop more debris, or the base union failed" },
      positive_volume: { hint: "inverted normals or a non-watertight mesh; check the watertight gate first" },
      watertight: { hint: "raise repair.remesh_fallback to voxel, or the hole is too large to fill honestly" },
    },
    ops: OPS, stages: STAGES, mesh: "floating_shells.stl",
    failure: "FAIL watertight: False\nFAIL shell_count: 4, needs <= 1\nFAIL positive_volume: nan",
  },
  {
    // How the 70 mm run above gets fixed: print it taller.
    run_id: "9d3f77aa0c14", alias: "subject-a", outcome: "pass", style: "chibi_vinyl",
    backend: "trellis2", height: 130, ageHours: 4, overhang: "21.4%",
    before: { vertices: 11402, faces: 4210, shells: 7, watertight: false, open_boundary_loops: 3, min_wall_mm: 0.29, volume_mm3: null, bbox: [38.0, 24.1, 61.2] },
    after: { vertices: 2103, faces: 3944, shells: 1, watertight: true, open_boundary_loops: 0, min_wall_mm: 1.118, volume_mm3: 71903.2, bbox: [52.0, 52.0, 130.0] },
    ops: OPS, stages: STAGES, mesh: "good_figure.stl",
  },
  {
    run_id: "e8104bb3d95f", alias: "subject-b", outcome: "pass", style: "blocky_minifig",
    backend: "trellis2", height: 100, ageHours: 49, overhang: "8.2%",
    before: { vertices: 7702, faces: 2610, shells: 2, watertight: true, open_boundary_loops: 0, min_wall_mm: 3.9, volume_mm3: 51002, bbox: [40.1, 30.0, 84.4] },
    after: { vertices: 1288, faces: 2480, shells: 1, watertight: true, open_boundary_loops: 0, min_wall_mm: 4.802, volume_mm3: 78440.9, bbox: [46.0, 46.0, 100.0] },
    ops: OPS, stages: STAGES, mesh: "good_figure.stl",
  },
  {
    // Refused before generation. No gates, no stats, no mesh: the UI must not fall over.
    run_id: "f0a5cc27b381", alias: "subject-b", outcome: "error", style: "chibi_vinyl",
    backend: "tripo", height: 100, ageHours: 73, overhang: "0%",
    before: null, after: null, ops: [], stages: STAGES.slice(0, 2),
    failure:
      "backend 'tripo' uploads the reference image to a third party.\nRefusing. Pass --allow-upload only for synthetic or public-domain bake-off images, never for family photos. See prd.md section 3.",
  },
];

/** Three printers, in the three states the right-hand panel has to render well. */
const PRINTERS = [
  {
    id: "p1s-a", name: "BENCH-01", model: "Bambu Lab P1S", nozzle: 0.4,
    state: "printing", run_id: "ad80ffb135a9",
    // Started 41 minutes ago against a 78-minute job: mid-print, bar visibly moving.
    startedMinutesAgo: 41, durationMinutes: 78, layers: 625,
    nozzle_temp: 220, bed_temp: 60, filament: "PLA Basic · Jade White", message: null,
  },
  {
    id: "p1s-b", name: "BENCH-02", model: "Bambu Lab P1S", nozzle: 0.4,
    state: "paused", run_id: "e8104bb3d95f",
    startedMinutesAgo: 12, durationMinutes: 96, layers: 640,
    nozzle_temp: 180, bed_temp: 60, filament: "PLA Matte · Charcoal",
    message: "filament runout on AMS slot 1",
  },
  {
    id: "a1-c", name: "BENCH-03", model: "Bambu Lab A1 mini", nozzle: 0.4,
    state: "idle", run_id: null,
    startedMinutesAgo: null, durationMinutes: null, layers: null,
    nozzle_temp: 24, bed_temp: 23, filament: "PLA Basic · Bambu Green", message: null,
  },
] as const;

export function seed(db: Database, now = Date.now() / 1000): number {
  const insertRun = db.prepare(
    `INSERT INTO runs (run_id, started_at, subject_alias, outcome, style_preset, style_hash,
       generator_backend, generator_version, seed, height_mm, printer, git_sha,
       failure_reason, mesh_path, manifest_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insertGate = db.prepare(
    "INSERT INTO gates (run_id, ord, gate, passed, measured, requirement, hint) VALUES (?,?,?,?,?,?,?)",
  );
  const insertStat = db.prepare(
    `INSERT INTO stats (run_id, phase, vertices, faces, shells, watertight,
       open_boundary_loops, min_wall_mm, volume_mm3, bbox_json) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  const insertOp = db.prepare(
    "INSERT INTO ops (run_id, ord, op, changed, detail_json) VALUES (?,?,?,?,?)",
  );
  const insertStage = db.prepare(
    "INSERT INTO stages (run_id, name, at_seconds, detail_json) VALUES (?,?,?,?)",
  );
  const insertPrinter = db.prepare(
    `INSERT INTO printers (id, name, model, nozzle_mm, state, run_id, started_at,
       duration_s, layers, nozzle_temp, bed_temp, filament, message)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  db.transaction(() => {
    for (const table of ["gates", "stats", "ops", "stages", "printers", "runs"]) {
      db.exec(`DELETE FROM ${table}`);
    }

    for (const r of RUNS) {
      const meshPath = r.mesh ? join(FIXTURES, r.mesh) : null;
      insertRun.run(
        r.run_id, now - r.ageHours * HOUR, r.alias, r.outcome, r.style,
        "a3f1c9d2b4e60781", r.backend, "TRELLIS.2-4B", 40318, r.height,
        "bambu_p1s_0.4", "7faefb63edda42866c7d1e950baf97d3cdb5869c",
        r.failure ?? null,
        meshPath && existsSync(meshPath) ? meshPath : null,
        JSON.stringify({ run_id: r.run_id, seeded: true }),
      );

      const gates = r.after ? gatesFor(r.after, r.overhang, r.gateOverrides) : [];
      gates.forEach((g, i) =>
        insertGate.run(r.run_id, i, g.gate, g.passed ? 1 : 0, g.measured, g.requirement, g.hint ?? ""));

      for (const [phase, s] of [["before", r.before], ["after", r.after]] as const) {
        if (!s) continue;
        insertStat.run(r.run_id, phase, s.vertices, s.faces, s.shells,
          s.watertight ? 1 : 0, s.open_boundary_loops, s.min_wall_mm,
          s.volume_mm3, JSON.stringify(s.bbox));
      }

      r.ops.forEach((o, i) => insertOp.run(r.run_id, i, o.op, o.changed ? 1 : 0, JSON.stringify(o.detail)));
      r.stages.forEach((s) => insertStage.run(r.run_id, s.name, s.at, JSON.stringify(s.detail)));
    }

    for (const p of PRINTERS) {
      insertPrinter.run(
        p.id, p.name, p.model, p.nozzle, p.state, p.run_id,
        p.startedMinutesAgo === null ? null : now - p.startedMinutesAgo * 60,
        p.durationMinutes === null ? null : p.durationMinutes * 60,
        p.layers, p.nozzle_temp, p.bed_temp, p.filament, p.message,
      );
    }
  })();

  return RUNS.length;
}

if (import.meta.main) {
  const db = openDb();
  const n = seed(db);
  const missing = RUNS.filter((r) => r.mesh && !existsSync(join(FIXTURES, r.mesh)));
  console.log(`seeded ${n} runs into ${DB_PATH}`);
  if (missing.length) {
    console.warn(`note: ${missing.length} fixture mesh(es) missing — run 'make fixtures' for 3D previews`);
  }
  db.close();
}
