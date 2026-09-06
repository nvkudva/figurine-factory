import { expect, test, describe } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getRun, listRuns } from "../server/db.ts";
import { seed } from "../server/seed.ts";

function freshDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(join(import.meta.dir, "../../src/figurine_factory/web/schema.sql"), "utf8"));
  seed(db);
  return db;
}

describe("run store", () => {
  test("lists runs newest first", () => {
    const runs = listRuns(freshDb());
    expect(runs.length).toBe(6);
    const times = runs.map((r) => r.started_at ?? 0);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  test("summarises failed gates by name", () => {
    const runs = listRuns(freshDb());
    const failed = runs.find((r) => r.run_id === "5b2a9c1d77e0");
    expect(failed?.outcome).toBe("validation_failed");
    expect(failed?.failedGates.sort()).toEqual(["positive_volume", "shell_count", "watertight"]);
  });

  test("gate measurements agree with the run's own stats", () => {
    // Sample data that contradicts itself trains you to distrust the real thing.
    const db = freshDb();
    for (const summary of listRuns(db)) {
      const run = getRun(db, summary.run_id);
      const after = run?.stats.after;
      if (!after?.bbox) continue;
      const bboxGate = run?.gates.find((g) => g.gate === "fits_plate");
      expect(bboxGate?.measured).toBe(`[${after.bbox.map((v) => v.toFixed(1)).join(", ")}]`);
      expect(after.bbox[2]).toBe(run!.height_mm!);
    }
  });

  test("a non-watertight mesh has null volume, not zero", () => {
    const run = getRun(freshDb(), "5b2a9c1d77e0");
    expect(run?.stats.after?.watertight).toBe(0);
    expect(run?.stats.after?.volume_mm3).toBeNull();
  });

  test("a refused run has no gates, no stats and no mesh", () => {
    const run = getRun(freshDb(), "f0a5cc27b381");
    expect(run?.gates).toEqual([]);
    expect(run?.stats.after).toBeNull();
    expect(run?.hasMesh).toBe(false);
    expect(run?.failure_reason).toContain("Refusing");
  });

  test("every failing gate carries a fix hint", () => {
    const db = freshDb();
    for (const summary of listRuns(db)) {
      for (const gate of getRun(db, summary.run_id)?.gates ?? []) {
        if (!gate.passed) expect(gate.hint?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  test("unknown run id returns null", () => {
    expect(getRun(freshDb(), "nope")).toBeNull();
  });
});
