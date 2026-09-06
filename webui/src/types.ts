export type Outcome = "pass" | "validation_failed" | "error" | "incomplete";

export interface RunSummary {
  run_id: string;
  started_at: number | null;
  subject_alias: string;
  outcome: Outcome;
  style_preset: string | null;
  generator_backend: string | null;
  height_mm: number | null;
  gatesPassed: number;
  gatesTotal: number;
  failedGates: string[];
}

export interface Gate {
  gate: string;
  passed: number;
  measured: string | null;
  requirement: string | null;
  hint: string | null;
}

export interface MeshStats {
  phase: string;
  vertices: number | null;
  faces: number | null;
  shells: number | null;
  watertight: number | null;
  open_boundary_loops: number | null;
  min_wall_mm: number | null;
  volume_mm3: number | null;
  bbox: number[] | null;
}

export interface RepairOp {
  op: string;
  changed: number;
  detail: Record<string, unknown>;
}

export interface Stage {
  name: string;
  at_seconds: number | null;
  detail: Record<string, unknown>;
}

export interface RunDetail extends Omit<RunSummary, "gatesPassed" | "gatesTotal" | "failedGates"> {
  style_hash: string | null;
  generator_version: string | null;
  seed: number | null;
  printer: string | null;
  git_sha: string | null;
  failure_reason: string | null;
  mesh_path: string | null;
  hasMesh: boolean;
  gates: Gate[];
  stats: { before: MeshStats | null; after: MeshStats | null };
  ops: RepairOp[];
  stages: Stage[];
}

export interface Status {
  db: string;
  runs: number;
  mock: boolean;
}
