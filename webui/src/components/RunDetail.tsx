import { Suspense, lazy } from "react";

import { api } from "../api.ts";
import { cx } from "../cx.ts";
import type { RunDetail as Run } from "../types.ts";
import { OutcomeBadge } from "./Badge.tsx";
import { GateTable } from "./GateTable.tsx";
import { StageTimeline } from "./StageTimeline.tsx";
import { StatDiff } from "./StatDiff.tsx";
import styles from "./RunDetail.module.css";

// three.js is ~500 kB and only the stage needs it, so the dashboard paints first.
const MeshViewer = lazy(() =>
  import("./MeshViewer.tsx").then((m) => ({ default: m.MeshViewer })),
);

function Fact({ label, value, hot }: { label: string; value: React.ReactNode; hot?: boolean }) {
  return (
    <div className={styles.fact}>
      <div className={styles.factLabel}>{label}</div>
      <div className={cx(styles.factValue, hot && styles.factHot)}>{value ?? "—"}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className="label">[ {title} ]</span>
        <span className={styles.rule} />
      </div>
      {children}
    </section>
  );
}

export function RunDetail({ run }: { run: Run }) {
  const passed = run.gates.filter((g) => g.passed).length;
  const bbox = run.stats.after?.bbox;

  return (
    <div className={styles.detail}>
      <div className={styles.head}>
        <h1 className={styles.title}>{run.subject_alias}</h1>
        <span className={styles.runId}>{run.run_id}</span>
        <span className={styles.headEnd}>
          <OutcomeBadge outcome={run.outcome} />
        </span>
      </div>

      <div className={styles.stage}>
        <Suspense fallback={<div className={styles.viewerFallback}>initialising viewport…</div>}>
          <MeshViewer url={api.meshUrl(run.run_id)} hasMesh={run.hasMesh} />
        </Suspense>
        <div className={styles.stageBar}>
          <span>{run.generator_version ?? run.generator_backend ?? "—"}</span>
          <span>
            {bbox ? `${bbox.map((v) => v.toFixed(1)).join(" × ")} mm` : "no geometry"}
          </span>
          {run.hasMesh && (
            <a className={styles.download} href={api.meshUrl(run.run_id)} download>
              download stl
            </a>
          )}
        </div>
      </div>

      <div className={styles.facts}>
        <Fact label="gates" hot value={run.gates.length ? `${passed}/${run.gates.length}` : "—"} />
        <Fact label="height" value={run.height_mm ? `${run.height_mm} mm` : "—"} />
        <Fact label="style" value={run.style_preset} />
        <Fact label="generator" value={run.generator_backend} />
        <Fact label="seed" value={run.seed} />
        <Fact label="printer" value={run.printer} />
      </div>

      {run.failure_reason && <pre className={styles.failure}>{run.failure_reason}</pre>}

      <Section title="pipeline">
        <StageTimeline run={run} />
      </Section>

      <Section title="validation gates">
        <div className={cx(styles.card, !run.gates.length && styles.cardPad)}>
          <GateTable gates={run.gates} />
        </div>
      </Section>

      <div className={styles.grid}>
        <Section title="mesh before / after repair">
          <div className={cx(styles.card, !run.stats.before && styles.cardPad)}>
            <StatDiff before={run.stats.before} after={run.stats.after} />
          </div>
        </Section>

        {run.ops.length > 0 && (
          <Section title="repair operations">
            <ul className={cx(styles.card, styles.ops)}>
              {run.ops.map((op) => (
                <li key={op.op} className={cx(styles.op, !op.changed && styles.unchanged)}>
                  <span className={styles.opName}>{op.op}</span>
                  <span className={styles.opDetail}>{JSON.stringify(op.detail)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
