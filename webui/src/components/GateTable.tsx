import { Fragment } from "react";
import type { Gate } from "../types.ts";
import { cx } from "../cx.ts";
import styles from "./GateTable.module.css";

export function GateTable({ gates }: { gates: Gate[] }) {
  if (gates.length === 0) {
    return <p className={styles.empty}>This run never reached validation.</p>;
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.mark} />
            <th>Gate</th>
            <th>Measured</th>
            <th>Requirement</th>
          </tr>
        </thead>
        <tbody>
          {gates.map((gate) => {
            const failed = !gate.passed;
            return (
              <Fragment key={gate.gate}>
                <tr className={failed ? styles.failRow : undefined}>
                  <td className={cx(styles.mark, failed ? styles.no : styles.ok)}>
                    {failed ? "✕" : "✓"}
                  </td>
                  <td className={styles.name}>{gate.gate}</td>
                  <td className="num">{gate.measured ?? "—"}</td>
                  <td className="num" style={{ color: "var(--text-dim)" }}>
                    {gate.requirement ?? "—"}
                  </td>
                </tr>
                {failed && gate.hint && (
                  <tr className={styles.failRow}>
                    <td />
                    <td colSpan={3} className={styles.hint}>
                      <span className={styles.hintLabel}>fix</span>
                      {gate.hint}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
