import { Suspense, lazy } from "react";

import type { RunDetail as Run } from "../types.ts";
import { api } from "../api.ts";
import { OutcomeBadge } from "./Badge.tsx";
import { GateTable } from "./GateTable.tsx";
import { StageTimeline } from "./StageTimeline.tsx";
import { StatDiff } from "./StatDiff.tsx";
import { cx } from "../cx.ts";
import styles from "./RunDetail.module.css";

// three.js is ~600 kB and only the mesh panel needs it, so the dashboard paints first.
const MeshViewer = lazy(() =>
  import("./MeshViewer.tsx").then((m) => ({ default: m.MeshViewer })),
);

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.fact}>
      <div className={styles.factLabel}>{label}</div>
      <div className={styles.factValue}>{value ?? "—"}</div>
    </div>
  );
}

export function RunDetail({ run }: { run: Run }) {
  const passed = run.gates.filter((g) => g.passed).length;

  return (
    <div className={styles.detail}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{run.subject_alias}</h1>
          <div className={styles.runId}>{run.run_id}</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <OutcomeBadge outcome={run.outcome} />
        </div>
      </div>

      <div className={styles.facts}>
        <Fact label="gates" value={
          <span className="num">
            {run.gates.length ? `${passed}/${run.gates.length}` : "—"}
          </span>
        } />
        <Fact label="height" value={<span className="num">{run.height_mm ? `${run.height_mm} mm` : "—"}</span>} />
        <Fact label="style" value={run.style_preset} />
        <Fact label="generator" value={run.generator_backend} />
        <Fact label="seed" value={<span className="num">{run.seed ?? "—"}</span>} />
        <Fact label="printer" value={run.printer} />
      </div>

      {run.failure_reason && <pre className={styles.failure}>{run.failure_reason}</pre>}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Pipeline</h2>
        <StageTimeline run={run} />
      </div>

      <div className={styles.grid}>
        <div>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Validation gates</h2>
            <div className={cx(styles.card, !run.gates.length && styles.cardPad)}>
              <GateTable gates={run.gates} />
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Mesh before / after repair</h2>
            <div className={cx(styles.card, !run.stats.before && styles.cardPad)}>
              <StatDiff before={run.stats.before} after={run.stats.after} />
            </div>
          </div>

          {run.ops.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Repair operations</h2>
              <ul className={cx(styles.card, styles.ops)}>
                {run.ops.map((op) => (
                  <li key={op.op} className={cx(styles.op, !op.changed && styles.unchanged)}>
                    <span className={styles.opName}>{op.op}</span>
                    <span className={styles.opDetail}>{JSON.stringify(op.detail)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Mesh</h2>
          <Suspense fallback={<div className={styles.viewerFallback}>loading viewer…</div>}>
            <MeshViewer url={api.meshUrl(run.run_id)} hasMesh={run.hasMesh} />
          </Suspense>
          {run.hasMesh && (
            <a className={styles.download} href={api.meshUrl(run.run_id)} download>
              Download STL
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
