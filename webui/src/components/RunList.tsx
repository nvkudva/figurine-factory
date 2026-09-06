import { api } from "../api.ts";
import { cx } from "../cx.ts";
import type { RunSummary } from "../types.ts";
import { OutcomeBadge } from "./Badge.tsx";
import { Thumbnail } from "./Thumbnail.tsx";
import styles from "./RunList.module.css";

function ago(seconds: number | null): string {
  if (!seconds) return "—";
  const mins = Math.round(Date.now() / 1000 - seconds) / 60;
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = mins / 60;
  return hours < 48 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

/** One tick per gate: the run's health readable at a glance, before any text. */
function GateGauge({ passed, total }: { passed: number; total: number }) {
  if (total === 0) return null;
  return (
    <div className={styles.gauge} aria-label={`${passed} of ${total} gates passed`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx(styles.tick, i < passed ? styles.tickPass : styles.tickFail)} />
      ))}
    </div>
  );
}

export function RunList({ runs, selected, onSelect }: {
  runs: RunSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (runs.length === 0) {
    return (
      <p className={styles.empty}>
        No runs yet.<br />
        <code>figurine repair &lt;mesh&gt;</code><br />
        <code>figurine publish out/&lt;run_id&gt;</code>
      </p>
    );
  }

  return (
    <div className={styles.list}>
      {runs.map((run) => (
        <button
          key={run.run_id}
          type="button"
          className={cx(styles.item, run.run_id === selected && styles.active)}
          onClick={() => onSelect(run.run_id)}
          aria-current={run.run_id === selected}
        >
          <Thumbnail
            url={api.meshUrl(run.run_id)}
            hasMesh={run.outcome !== "error"}
            alt={`mesh preview for ${run.subject_alias}`}
          />
          <span className={styles.info}>
            <span className={styles.top}>
              <span className={styles.alias}>{run.subject_alias}</span>
              <OutcomeBadge outcome={run.outcome} />
            </span>
            <span className={styles.meta}>
              <span>{run.height_mm ? `${run.height_mm}mm` : "—"}</span>
              <span className={styles.style}>{run.style_preset ?? "—"}</span>
              <span className={styles.when}>{ago(run.started_at)}</span>
            </span>
            <GateGauge passed={run.gatesPassed} total={run.gatesTotal} />
            {run.failedGates.length > 0 && (
              <span className={styles.failed}>✕ {run.failedGates.join(" · ")}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
