import type { RunSummary } from "../types.ts";
import { OutcomeBadge } from "./Badge.tsx";
import { cx } from "../cx.ts";
import styles from "./RunList.module.css";

function ago(seconds: number | null): string {
  if (!seconds) return "—";
  const mins = Math.round((Date.now() / 1000 - seconds) / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export function RunList({ runs, selected, onSelect }: {
  runs: RunSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (runs.length === 0) {
    return (
      <p className={styles.empty}>
        No runs yet. Run <code>figurine repair &lt;mesh&gt;</code>, then{" "}
        <code>figurine publish out/&lt;run_id&gt;</code>.
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
          <div className={styles.top}>
            <span className={styles.alias}>{run.subject_alias}</span>
            <OutcomeBadge outcome={run.outcome} />
          </div>
          <div className={styles.meta}>
            <span className={styles.id}>{run.run_id.slice(0, 8)}</span>
            <span className="num">{run.height_mm ? `${run.height_mm}mm` : "—"}</span>
            <span className={styles.style}>{run.style_preset ?? "\u2014"}</span>
            <span className={styles.when}>{ago(run.started_at)}</span>
          </div>
          {run.failedGates.length > 0 && (
            <div className={styles.failed}>✕ {run.failedGates.join(", ")}</div>
          )}
        </button>
      ))}
    </div>
  );
}
