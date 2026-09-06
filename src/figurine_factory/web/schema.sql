-- Shared by the Python pipeline (writer) and the Bun server (reader).
-- Keep both sides in step: this file is the single definition.

PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS runs (
  run_id            TEXT PRIMARY KEY,
  started_at        REAL,
  subject_alias     TEXT NOT NULL DEFAULT 'subject',
  outcome           TEXT NOT NULL,          -- pass | validation_failed | error | incomplete
  style_preset      TEXT,
  style_hash        TEXT,
  generator_backend TEXT,
  generator_version TEXT,
  seed              INTEGER,
  height_mm         REAL,
  printer           TEXT,
  git_sha           TEXT,
  failure_reason    TEXT,
  mesh_path         TEXT,                   -- absolute path on this machine, never uploaded
  manifest_json     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  ord         INTEGER NOT NULL,
  gate        TEXT NOT NULL,
  passed      INTEGER NOT NULL,
  measured    TEXT,
  requirement TEXT,
  hint        TEXT
);

CREATE TABLE IF NOT EXISTS stats (
  run_id              TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  phase               TEXT NOT NULL,        -- before | after
  vertices            INTEGER,
  faces               INTEGER,
  shells              INTEGER,
  watertight          INTEGER,
  open_boundary_loops INTEGER,
  min_wall_mm         REAL,
  volume_mm3          REAL,                 -- NULL when the mesh is not watertight
  bbox_json           TEXT,
  PRIMARY KEY (run_id, phase)
);

CREATE TABLE IF NOT EXISTS ops (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  ord         INTEGER NOT NULL,
  op          TEXT NOT NULL,
  changed     INTEGER NOT NULL,
  detail_json TEXT
);

CREATE TABLE IF NOT EXISTS stages (
  run_id      TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  at_seconds  REAL,
  detail_json TEXT,
  PRIMARY KEY (run_id, name)
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_gates_run    ON gates(run_id, ord);

-- Printer farm. Populated by the seed today; a real Bambu bridge would write the same
-- rows from the MQTT status topic. The UI does not care which wrote them.
CREATE TABLE IF NOT EXISTS printers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  model         TEXT NOT NULL,
  nozzle_mm     REAL NOT NULL DEFAULT 0.4,
  state         TEXT NOT NULL,            -- printing | idle | paused | error | offline
  run_id        TEXT REFERENCES runs(run_id) ON DELETE SET NULL,
  started_at    REAL,                     -- when the current job started
  duration_s    REAL,                     -- estimated total for the current job
  layers        INTEGER,
  nozzle_temp   REAL,
  bed_temp      REAL,
  filament      TEXT,
  message       TEXT                      -- why it is paused or errored
);
