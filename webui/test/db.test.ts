import { expect, test, describe } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getRun, listRuns } from "../server/db.ts";
import { listPrinters } from "../server/printers.ts";
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

describe("printer farm", () => {
  test("orders by attention needed, not by id", () => {
    const states = listPrinters(freshDb()).map((p) => p.state);
    expect(states).toEqual(["paused", "printing", "idle"]);
  });

  test("derives progress from elapsed time against the estimate", () => {
    const db = freshDb();
    const start = Date.now() / 1000;
    const [, printing] = listPrinters(db, start);
    // Seeded 41 minutes into a 78 minute job.
    expect(printing!.progress).toBeCloseTo(41 / 78, 2);
    expect(printing!.layer).toBe(Math.round((41 / 78) * 625));
    expect(printing!.etaSeconds).toBeCloseTo((78 - 41) * 60, 0);
  });

  test("progress advances as the clock does", () => {
    const db = freshDb();
    const now = Date.now() / 1000;
    const before = listPrinters(db, now)[1]!.progress!;
    const after = listPrinters(db, now + 600)[1]!.progress!;
    expect(after).toBeGreaterThan(before);
  });

  test("progress is clamped to 1 once the estimate is exceeded", () => {
    const db = freshDb();
    const wayLater = Date.now() / 1000 + 86_400;
    for (const p of listPrinters(db, wayLater)) {
      if (p.progress !== null) expect(p.progress).toBeLessThanOrEqual(1);
      if (p.etaSeconds !== null) expect(p.etaSeconds).toBeGreaterThanOrEqual(0);
    }
  });

  test("an idle printer has no job, no progress and no eta", () => {
    const idle = listPrinters(freshDb()).find((p) => p.state === "idle");
    expect(idle?.run_id).toBeNull();
    expect(idle?.progress).toBeNull();
    expect(idle?.etaSeconds).toBeNull();
  });

  test("a stopped printer explains itself", () => {
    const paused = listPrinters(freshDb()).find((p) => p.state === "paused");
    expect(paused?.message).toContain("runout");
    expect(paused?.subject_alias).toBeTruthy();
  });
});
