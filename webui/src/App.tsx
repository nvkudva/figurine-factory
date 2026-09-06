import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { RunDetail } from "./components/RunDetail.tsx";
import { RunList } from "./components/RunList.tsx";
import type { RunDetail as Run, RunSummary, Status } from "./types.ts";
import styles from "./App.module.css";

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
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
    if (!selected) return;
    setRun(null);
    api.run(selected).then(setRun).catch((e: Error) => setError(e.message));
  }, [selected]);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <h1 className={styles.brandName}>Figurine Factory</h1>
          <p className={styles.brandSub}>
            {runs.length} run{runs.length === 1 ? "" : "s"}
          </p>
        </div>

        {status?.mock && (
          <div className={styles.mockBanner}>
            <strong>Mock data.</strong> These runs are seeded samples, not real figurines.
            Publish a real one with <code>figurine publish out/&lt;run_id&gt;</code>.
          </div>
        )}

        <div className={styles.scroll}>
          <RunList runs={runs} selected={selected} onSelect={setSelected} />
        </div>
      </aside>

      <main className={styles.main}>
        {error && <div className={styles.placeholder}>Could not reach the API: {error}</div>}
        {!error && run && <RunDetail run={run} />}
        {!error && !run && selected && <div className={styles.placeholder}>loading…</div>}
        {!error && !selected && status && (
          <div className={styles.placeholder}>Select a run.</div>
        )}
      </main>
    </div>
  );
}
