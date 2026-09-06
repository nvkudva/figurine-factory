import { useEffect, useId, useState } from "react";
import { api } from "../api.ts";
import { cx } from "../cx.ts";
import { getThumbnail } from "../thumbnails.ts";
import type { Printer } from "../types.ts";
import styles from "./PrinterCard.module.css";

/** Geometry of the little printer drawing, in its own viewBox units. */
const RIG = { w: 96, h: 108, plateY: 88, ceilingY: 22, bedX: 16, bedW: 64 };

function eta(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/**
 * A CoreXY box printer. The gantry rides up as the job progresses and the model is
 * revealed bottom-up by a clip rectangle, so the picture is the progress bar rather
 * than a decoration sitting next to one.
 */
function Rig({ progress, thumb, active }: {
  progress: number;
  thumb: string | null;
  active: boolean;
}) {
  // SVG ids are document-global, so two printers at the same progress would otherwise
  // share a clip path and one would render with the other's fill level.
  const uid = useId().replace(/:/g, "");
  const clipId = `grow-${uid}`;
  const glassId = `glass-${uid}`;
  const build = RIG.plateY - RIG.ceilingY;
  const grown = build * progress;
  const gantryY = RIG.plateY - grown;
  const modelH = 52;
  const modelTop = RIG.plateY - modelH;
  const clipH = Math.min(grown, modelH);

  return (
    <svg className={styles.rig} viewBox={`0 0 ${RIG.w} ${RIG.h}`} role="img"
         aria-label={`printer at ${Math.round(progress * 100)} percent`}>
      <defs>
        <clipPath id={clipId}>
          <rect x={RIG.bedX} y={RIG.plateY - clipH} width={RIG.bedW} height={clipH} />
        </clipPath>
        <linearGradient id={glassId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22e6ff" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#ff3ec8" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {/* enclosure */}
      <rect x="6" y="8" width="84" height="92" fill={`url(#${glassId})`} stroke="#2a3a52" strokeWidth="1.5" />
      <rect x="6" y="8" width="84" height="92" fill="none" stroke="#22e6ff" strokeWidth="0.5" opacity="0.35" />
      {/* uprights */}
      <rect x="9" y="11" width="3" height="86" fill="#1c2534" />
      <rect x="84" y="11" width="3" height="86" fill="#1c2534" />

      {/* the part being printed, revealed from the plate up */}
      {thumb && clipH > 0.5 && (
        <image
          href={thumb}
          x={RIG.bedX} y={modelTop} width={RIG.bedW} height={modelH}
          preserveAspectRatio="xMidYMax meet"
          clipPath={`url(#${clipId})`}
        />
      )}

      {/* build plate */}
      <rect x={RIG.bedX - 4} y={RIG.plateY} width={RIG.bedW + 8} height="4" fill="#2a3a52" />
      <rect x={RIG.bedX - 4} y={RIG.plateY} width={RIG.bedW + 8} height="1" fill="#ff3ec8" opacity="0.55" />

      {/* gantry + toolhead, riding the current layer height */}
      <g style={{ transition: "transform 0.6s linear" }} transform={`translate(0, ${gantryY - RIG.plateY})`}>
        <rect x="12" y={RIG.plateY - 1} width="72" height="2" fill={active ? "#22e6ff" : "#2a3a52"}
              opacity={active ? 0.9 : 0.6} />
        <rect x="40" y={RIG.plateY - 5} width="16" height="9" fill="#141b27" stroke="#2a3a52" strokeWidth="0.8" />
        <rect x="46" y={RIG.plateY + 4} width="4" height="3" fill={active ? "#22e6ff" : "#3a4150"} />
        {active && (
          <circle cx="48" cy={RIG.plateY + 8} r="1.4" fill="#22e6ff">
            <animate attributeName="opacity" values="1;0.15;1" dur="1.1s" repeatCount="indefinite" />
          </circle>
        )}
      </g>

      {/* base + status lamp */}
      <rect x="6" y="100" width="84" height="6" fill="#10151f" stroke="#2a3a52" strokeWidth="1" />
      <circle cx="14" cy="103" r="1.6" fill={active ? "#6cff8f" : "#3a4150"}>
        {active && <animate attributeName="opacity" values="1;0.35;1" dur="2s" repeatCount="indefinite" />}
      </circle>
    </svg>
  );
}

export function PrinterCard({ printer }: { printer: Printer }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const active = printer.state === "printing";
  const progress = printer.progress ?? 0;

  useEffect(() => {
    if (!printer.run_id) return setThumb(null);
    let live = true;
    getThumbnail(api.meshUrl(printer.run_id))
      .then((d) => live && setThumb(d))
      .catch(() => live && setThumb(null));
    return () => {
      live = false;
    };
  }, [printer.run_id]);

  const stateClass =
    printer.state === "printing" ? styles.statePrinting
    : printer.state === "paused" ? styles.statePaused
    : printer.state === "error" ? styles.stateError
    : styles.stateIdle;

  return (
    <article className={cx(styles.card, styles[printer.state])}>
      <header className={styles.head}>
        <span className={styles.name}>{printer.name}</span>
        <span className={cx(styles.state, stateClass)}>{printer.state}</span>
        <span className={styles.model}>{printer.model}</span>
      </header>

      <div className={styles.body}>
        <Rig progress={progress} thumb={thumb} active={active} />

        <div className={styles.readout}>
          {printer.progress === null ? (
            <div className={styles.idleText}>no job</div>
          ) : (
            <>
              <div className={styles.pct}>{(progress * 100).toFixed(1)}%</div>
              <div className={styles.bar}>
                <div
                  className={cx(styles.fill, printer.state === "paused" && styles.fillPaused)}
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </>
          )}

          <dl className={styles.rows}>
            {printer.subject_alias && (
              <div className={styles.row}>
                <dt>job</dt>
                <dd className={styles.subject}>{printer.subject_alias}</dd>
              </div>
            )}
            {printer.layer !== null && (
              <div className={styles.row}>
                <dt>layer</dt>
                <dd>{printer.layer} / {printer.layers}</dd>
              </div>
            )}
            <div className={styles.row}>
              <dt>eta</dt>
              <dd>{eta(printer.etaSeconds)}</dd>
            </div>
            <div className={styles.row}>
              <dt>temp</dt>
              <dd>{printer.nozzle_temp}° / {printer.bed_temp}°</dd>
            </div>
          </dl>
        </div>
      </div>

      {printer.filament && (
        <dl className={styles.rows} style={{ marginTop: 6 }}>
          <div className={styles.row}>
            <dt>fil</dt>
            <dd>{printer.filament}</dd>
          </div>
        </dl>
      )}

      {printer.message && <p className={styles.message}>⚠ {printer.message}</p>}
    </article>
  );
}
