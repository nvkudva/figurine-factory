/**
 * Printer farm state.
 *
 * Progress is derived from wall-clock elapsed time against the job's estimated duration,
 * not stored as a number. A stored percentage goes stale the moment nothing updates it;
 * a derived one keeps moving on its own, which is what a progress bar has to do to be
 * worth looking at. A real Bambu bridge would write the same rows from the MQTT status
 * topic and this maths would stay put.
 */
import type { Database } from "bun:sqlite";

export interface PrinterRow {
  id: string;
  name: string;
  model: string;
  nozzle_mm: number;
  state: "printing" | "idle" | "paused" | "error" | "offline";
  run_id: string | null;
  started_at: number | null;
  duration_s: number | null;
  layers: number | null;
  nozzle_temp: number | null;
  bed_temp: number | null;
  filament: string | null;
  message: string | null;
}

export interface Printer extends PrinterRow {
  subject_alias: string | null;
  /** 0–1, derived from elapsed time. Null when there is no job. */
  progress: number | null;
  layer: number | null;
  etaSeconds: number | null;
}

export function listPrinters(db: Database, now = Date.now() / 1000): Printer[] {
  // Ordered by how much attention each needs: a stopped print outranks a running one,
  // and an idle machine sits at the bottom. Sorting by id would bury the paused one.
  const rows = db.query<PrinterRow & { subject_alias: string | null }, []>(
    `SELECT p.*, r.subject_alias
     FROM printers p LEFT JOIN runs r ON r.run_id = p.run_id
     ORDER BY CASE p.state
                WHEN 'error'    THEN 0
                WHEN 'paused'   THEN 1
                WHEN 'printing' THEN 2
                WHEN 'idle'     THEN 3
                ELSE 4
              END, p.name`,
  ).all();

  return rows.map((row) => {
    const running = row.state === "printing" || row.state === "paused";
    if (!running || !row.started_at || !row.duration_s) {
      return { ...row, progress: null, layer: null, etaSeconds: null };
    }
    const elapsed = now - row.started_at;
    const progress = Math.min(Math.max(elapsed / row.duration_s, 0), 1);
    return {
      ...row,
      progress,
      layer: row.layers ? Math.min(Math.round(progress * row.layers), row.layers) : null,
      etaSeconds: Math.max(Math.round(row.duration_s - elapsed), 0),
    };
  });
}
