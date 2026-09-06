import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The schema lives with the Python writer so both sides cannot drift apart. */
const SCHEMA_PATH = join(
  import.meta.dir,
  "../../src/figurine_factory/web/schema.sql",
);

export const DB_PATH = process.env.FIGURINE_DB ?? join(import.meta.dir, "../figurine.db");

export function openDb(path: string = DB_PATH): Database {
  const db = new Database(path, { create: true });
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

export interface RunRow {
  run_id: string;
  started_at: number | null;
  subject_alias: string;
  outcome: string;
  style_preset: string | null;
  style_hash: string | null;
  generator_backend: string | null;
  generator_version: string | null;
  seed: number | null;
  height_mm: number | null;
  printer: string | null;
  git_sha: string | null;
  failure_reason: string | null;
  mesh_path: string | null;
}

export interface GateRow {
  gate: string;
  passed: number;
  measured: string | null;
  requirement: string | null;
  hint: string | null;
}

export interface StatRow {
  phase: string;
  vertices: number | null;
  faces: number | null;
  shells: number | null;
  watertight: number | null;
  open_boundary_loops: number | null;
  min_wall_mm: number | null;
  volume_mm3: number | null;
  bbox_json: string | null;
}

export interface OpRow {
  op: string;
  changed: number;
  detail_json: string | null;
}

export interface StageRow {
  name: string;
  at_seconds: number | null;
  detail_json: string | null;
}

const RUN_COLS = `run_id, started_at, subject_alias, outcome, style_preset, style_hash,
  generator_backend, generator_version, seed, height_mm, printer, git_sha,
  failure_reason, mesh_path`;

export function listRuns(db: Database) {
  const runs = db.query<RunRow, []>(
    `SELECT ${RUN_COLS} FROM runs ORDER BY started_at DESC`,
  ).all();

  const gateCounts = db.query<
    { run_id: string; passed: number; total: number; failed: string | null },
    []
  >(
    `SELECT run_id,
            SUM(passed) AS passed,
            COUNT(*)    AS total,
            GROUP_CONCAT(CASE WHEN passed = 0 THEN gate END) AS failed
     FROM gates GROUP BY run_id`,
  ).all();

  const byRun = new Map(gateCounts.map((g) => [g.run_id, g]));
  return runs.map((run) => {
    const g = byRun.get(run.run_id);
    return {
      ...run,
      gatesPassed: g?.passed ?? 0,
      gatesTotal: g?.total ?? 0,
      failedGates: g?.failed ? g.failed.split(",") : [],
    };
  });
}

export function getRun(db: Database, runId: string) {
  const run = db.query<RunRow, [string]>(
    `SELECT ${RUN_COLS} FROM runs WHERE run_id = ?`,
  ).get(runId);
  if (!run) return null;

  const gates = db.query<GateRow, [string]>(
    "SELECT gate, passed, measured, requirement, hint FROM gates WHERE run_id = ? ORDER BY ord",
  ).all(runId);

  const stats = db.query<StatRow, [string]>(
    `SELECT phase, vertices, faces, shells, watertight, open_boundary_loops,
            min_wall_mm, volume_mm3, bbox_json
     FROM stats WHERE run_id = ?`,
  ).all(runId);

  const ops = db.query<OpRow, [string]>(
    "SELECT op, changed, detail_json FROM ops WHERE run_id = ? ORDER BY ord",
  ).all(runId);

  const stages = db.query<StageRow, [string]>(
    "SELECT name, at_seconds, detail_json FROM stages WHERE run_id = ? ORDER BY at_seconds",
  ).all(runId);

  const statFor = (phase: string) => {
    const row = stats.find((s) => s.phase === phase);
    if (!row) return null;
    const { bbox_json, ...rest } = row;
    return { ...rest, bbox: bbox_json ? (JSON.parse(bbox_json) as number[]) : null };
  };

  return {
    ...run,
    hasMesh: Boolean(run.mesh_path),
    gates,
    stats: { before: statFor("before"), after: statFor("after") },
    ops: ops.map((o) => ({ ...o, detail: o.detail_json ? JSON.parse(o.detail_json) : {} })),
    stages: stages.map((s) => ({
      ...s,
      detail: s.detail_json ? JSON.parse(s.detail_json) : {},
    })),
  };
}

export type RunSummary = ReturnType<typeof listRuns>[number];
export type RunDetail = NonNullable<ReturnType<typeof getRun>>;
