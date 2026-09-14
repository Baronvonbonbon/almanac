import { useEffect, useState, type CSSProperties } from "react";
import { t } from "../i18n";
import "./starting.css";

/** When each message shows, in ms after the screen appears. The whole wait is at most HOST_WAIT_MS. */
const STAGES = [0, 3000, 6500] as const;
const MESSAGES = ["app.starting", "app.stillStarting", "app.slowStart"] as const;

/** The 28 days of a usual cycle, round a circle, starting at the top. */
const DAYS = Array.from({ length: 28 }, (_, i) => {
  const a = (i / 28) * 2 * Math.PI - Math.PI / 2;
  return { x: +(40 * Math.cos(a)).toFixed(2), y: +(40 * Math.sin(a)).toFixed(2) };
});

/**
 * While almanac waits for the Polkadot app. It fades in after a moment, so a quick start shows
 * nothing; then a lit day goes round a ring of 28, and the words say what is happening, and, if the
 * wait runs long, what happens next.
 */
export function Starting() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers = STAGES.slice(1).map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <main className="starting">
      <svg className="starting-ring" viewBox="-50 -50 100 100" aria-hidden="true">
        {DAYS.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={3.2} style={{ "--i": i } as CSSProperties} />
        ))}
      </svg>
      <p className="wordmark">{t("appName")}</p>
      <p className="starting-text" role="status">
        {t(MESSAGES[stage])}
      </p>
    </main>
  );
}
