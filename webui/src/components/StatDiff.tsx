import type { MeshStats } from "../types.ts";
import { cx } from "../cx.ts";
import styles from "./StatDiff.module.css";

type Direction = "lower" | "higher" | "none";

interface Row {
  label: string;
  pick: (s: MeshStats) => unknown;
  /** Which way is an improvement, so the arrow can be coloured honestly. */
  good: Direction;
}

const ROWS: Row[] = [
  { label: "vertices", pick: (s) => s.vertices, good: "none" },
  { label: "faces", pick: (s) => s.faces, good: "none" },
  { label: "shells", pick: (s) => s.shells, good: "lower" },
  { label: "watertight", pick: (s) => Boolean(s.watertight), good: "higher" },
  { label: "open boundary loops", pick: (s) => s.open_boundary_loops, good: "lower" },
  { label: "min wall (mm)", pick: (s) => s.min_wall_mm, good: "higher" },
  { label: "volume (mm³)", pick: (s) => s.volume_mm3, good: "none" },
  { label: "bbox (mm)", pick: (s) => s.bbox, good: "none" },
];

function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return `[${value.map((v) => Number(v).toFixed(1)).join(", ")}]`;
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  }
  return String(value);
}

function trend(before: unknown, after: unknown, good: Direction): string | undefined {
  if (good === "none") return undefined;
  const a = typeof before === "boolean" ? Number(before) : Number(before);
  const b = typeof after === "boolean" ? Number(after) : Number(after);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return undefined;
  const improved = good === "lower" ? b < a : b > a;
  return improved ? styles.better : styles.worse;
}

export function StatDiff({ before, after }: {
  before: MeshStats | null;
  after: MeshStats | null;
}) {
  if (!before || !after) {
    return <p className={styles.empty}>No mesh statistics — this run failed before repair.</p>;
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Stat</th>
            <th>Before</th>
            <th />
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const b = row.pick(before);
            const a = row.pick(after);
            const tone = trend(b, a, row.good);
            return (
              <tr key={row.label}>
                <td className={styles.label}>{row.label}</td>
                <td className={`num ${styles.before}`}>{show(b)}</td>
                <td className={cx(styles.arrow, tone)}>{tone ? "\u2192" : ""}</td>
                <td className={cx("num", styles.after, tone)}>{show(a)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
