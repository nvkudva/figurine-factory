import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { PrinterCard } from "./components/PrinterCard.tsx";
import { RunDetail } from "./components/RunDetail.tsx";
import { RunList } from "./components/RunList.tsx";
import type { Printer, RunDetail as Run, RunSummary, Status } from "./types.ts";
import styles from "./App.module.css";

/** Progress is derived from elapsed time server-side, so a slow poll still animates. */
const PRINTER_POLL_MS = 5000;

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.status(), api.runs()])
      .then(([s, r]) => {
        setStatus(s);
        setRuns(r);
        setSelected((current) => current ?? r[0]?.run_id ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    const load = () => api.printers().then(setPrinters).catch(() => undefined);
    load();
    const timer = setInterval(load, PRINTER_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selected) return;
    setRun(null);
    api.run(selected).then(setRun).catch((e: Error) => setError(e.message));
  }, [selected]);

  const busy = printers.filter((p) => p.state === "printing").length;

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.mark}>
          Figurine<span className={styles.slash}>//</span>Factory
        </span>
        {status?.mock && <span className={styles.mockChip}>mock data</span>}
        <div className={styles.topMeta}>
          <span>runs <b>{runs.length}</b></span>
          <span>printing <b>{busy}/{printers.length}</b></span>
        </div>
      </header>

      <aside className={`${styles.col} ${styles.left}`}>
        <div className={styles.colHead}>
          <span className="label">[ runs ]</span>
          <span className={styles.count}>{runs.length}</span>
        </div>
        <RunList runs={runs} selected={selected} onSelect={setSelected} />
      </aside>

      <main className={`${styles.col} ${styles.mid}`}>
        {error && <div className={`${styles.placeholder} ${styles.error}`}>api unreachable — {error}</div>}
        {!error && run && <RunDetail run={run} />}
        {!error && !run && selected && <div className={styles.placeholder}>loading run…</div>}
        {!error && !selected && status && <div className={styles.placeholder}>select a run</div>}
      </main>

      <aside className={`${styles.col} ${styles.right}`}>
        <div className={`${styles.colHead} ${styles.rightHead}`}>
          <span className="label">[ printer farm ]</span>
          <span className={styles.count}>{busy} active</span>
        </div>
        <div className={styles.farm}>
          {printers.map((p) => <PrinterCard key={p.id} printer={p} />)}
        </div>
        {status?.mock && (
          <p className={styles.farmNote}>
            Printer state is seeded. A Bambu bridge would write the same rows from the
            MQTT status topic — the panel would not change.
          </p>
        )}
      </aside>
    </div>
  );
}
