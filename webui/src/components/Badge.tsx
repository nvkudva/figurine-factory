import type { Outcome } from "../types.ts";
import { cx } from "../cx.ts";
import styles from "./Badge.module.css";

type Tone = "pass" | "fail" | "warn" | "neutral";

const TONE: Record<Outcome, { tone: Tone; label: string }> = {
  pass: { tone: "pass", label: "pass" },
  validation_failed: { tone: "fail", label: "gate failed" },
  error: { tone: "warn", label: "error" },
  incomplete: { tone: "neutral", label: "incomplete" },
};

export function Badge({ children, tone = "neutral" }: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <span className={cx(styles.badge, styles[tone])}>
      <span className={styles.dot} />
      {children}
    </span>
  );
}

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const { tone, label } = TONE[outcome] ?? TONE.incomplete;
  return <Badge tone={tone}>{label}</Badge>;
}
