import type { RunDetail } from "../types.ts";
import { cx } from "../cx.ts";
import styles from "./StageTimeline.module.css";

const ORDER = ["intake", "stylize", "generate", "repair", "validate", "slice"] as const;

export function StageTimeline({ run }: { run: RunDetail }) {
  const reached = new Map(run.stages.map((s) => [s.name, s.at_seconds]));
  // The stage a failed run stopped at is the first one it never recorded.
  const stalledAt = run.outcome === "pass" ? null : ORDER.find((name) => !reached.has(name));

  return (
    <div className={styles.track}>
      {ORDER.map((name) => {
        const at = reached.get(name);
        const done = at !== undefined;
        const failed = name === stalledAt || (done && name === "validate" && run.outcome === "validation_failed");
        return (
          <div
            key={name}
            className={cx(styles.stage, failed ? styles.failedStage : done ? styles.done : styles.skipped)}
          >
            <div className={styles.name}>{name}</div>
            <div className={cx("num", styles.time)}>
              {done && at !== null ? `${at.toFixed(1)}s` : failed ? "stopped" : "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
