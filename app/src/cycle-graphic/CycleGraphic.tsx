import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { t } from "../i18n";
import type { LookId } from "../look";
import { spanOf, within, type CycleShape } from "./shape";
import "./cycle-graphic.css";

interface GraphicProps {
  shape: CycleShape;
  /** Small, for the look picker: fewer details, the same drawing. */
  compact?: boolean;
}

/** The cycle, drawn the way the chosen look draws it: Hearth's ring, Moonpaper's dial, Pebble's path. */
export function CycleGraphic({ look, ...props }: GraphicProps & { look: LookId }) {
  if (look === "moonpaper") return <Dial {...props} />;
  if (look === "pebble") return <Pebbles {...props} />;
  return <Ring {...props} />;
}

// SVG geometry on a 240 × 240 canvas, angles in degrees clockwise from the top.
const C = 120;
const f = (n: number) => n.toFixed(2);
const point = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};
const arc = (r: number, from: number, to: number) => {
  const [x0, y0] = point(r, from);
  const [x1, y1] = point(r, to);
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
};

function Ring({ shape, compact }: GraphicProps) {
  const span = spanOf(shape);
  const step = 360 / span;
  const r = 96;
  const gap = Math.min(1.2, step / 4);
  const days = ([a, b]: [number, number]) => arc(r, (a - 1) * step + gap, b * step - gap);
  const todayDeg = (shape.day - 0.5) * step;
  const [tx, ty] = point(r, todayDeg);
  const elapsed = { "--len": ((2 * Math.PI * r * todayDeg) / 360).toFixed(1) } as CSSProperties;
  return (
    <div className="cg cg-ring">
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle className="cg-track" cx={C} cy={C} r={r} />
        <path className="cg-elapsed" d={arc(r, 0.01, todayDeg)} style={elapsed} />
        <path className="cg-period" d={days([1, shape.periodDays])} />
        {shape.fertile && <path className="cg-fertile" d={days(shape.fertile)} />}
        {shape.likely && <path className="cg-likely" d={arc(r + 16, (shape.likely[0] - 1) * step, shape.likely[1] * step)} />}
        <circle className="cg-today" cx={f(tx)} cy={f(ty)} r="11" />
      </svg>
      <div className="cg-center">
        <span className="cg-num">{t("prediction.day", { day: shape.day })}</span>
        {!compact && <span className="cg-of">{t("prediction.ofAbout", { length: shape.length })}</span>}
      </div>
    </div>
  );
}

function Dial({ shape, compact }: GraphicProps) {
  const span = spanOf(shape);
  const step = 360 / span;
  const r = 88;
  const quarter = Math.round(span / 4);
  const dots = Array.from({ length: span }, (_, i) => {
    const d = i + 1;
    const [x, y] = point(r, i * step).map(f);
    if (d === shape.day)
      return (
        <g key={d}>
          <circle className="cg-dial-today-ring" cx={x} cy={y} r="10" />
          <circle className="cg-dial-today" cx={x} cy={y} r="4.5" />
        </g>
      );
    const kind =
      d <= shape.periodDays ? ["cg-dial-period", 6] : within(d, shape.fertile) ? ["cg-dial-fertile", 4.6] : within(d, shape.likely) ? ["cg-dial-likely", 6] : d < shape.day ? ["cg-dial-past", 2.4] : ["cg-dial-future", 2.4];
    return <circle key={d} className={kind[0] as string} cx={x} cy={y} r={kind[1]} />;
  });
  return (
    <div className="cg cg-dial">
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle className="cg-dial-hair" cx={C} cy={C} r="70" />
        {dots}
        {!compact &&
          [1, 1 + quarter, 1 + 2 * quarter, 1 + 3 * quarter].map((d) => {
            const [x, y] = point(r + 22, (d - 1) * step).map(f);
            return (
              <text key={d} className="cg-dial-label" x={x} y={y}>
                {d}
              </text>
            );
          })}
      </svg>
      <div className="cg-center">
        {!compact && <span className="cg-kicker">{t("prediction.dayWord")}</span>}
        <span className="cg-num">{compact ? t("prediction.day", { day: shape.day }) : shape.day}</span>
        {!compact && <span className="cg-of">{t("prediction.ofAbout", { length: shape.length })}</span>}
      </div>
    </div>
  );
}

function Pebbles({ shape, compact }: GraphicProps) {
  const path = useRef<HTMLOListElement>(null);
  const span = spanOf(shape);
  const first = compact ? Math.max(1, Math.min(shape.day - 3, span - 6)) : 1;
  const last = compact ? Math.min(span, first + 6) : span;
  const days = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const kind = (d: number) =>
    d === shape.day ? "is-today" : d <= shape.periodDays ? "period" : within(d, shape.fertile) ? "fertile" : within(d, shape.likely) ? "likely" : d < shape.day ? "past" : "future";

  // The full path scrolls sideways; it opens with today in the middle.
  useLayoutEffect(() => {
    const el = path.current;
    const today = el?.querySelector<HTMLElement>(".is-today");
    if (el && today && !compact) el.scrollLeft = today.offsetLeft - el.clientWidth / 2 + today.offsetWidth / 2;
  }, [shape.day, compact]);

  return (
    <div className={`cg cg-pebbles${compact ? " compact" : ""}`}>
      <div className="cg-hero">
        <span className="cg-num">{t("prediction.day", { day: shape.day })}</span>
        {!compact && <span className="cg-of">{t("prediction.ofAbout", { length: shape.length })}</span>}
      </div>
      <ol className="cg-path" ref={path} aria-hidden="true">
        {days.map((d) => (
          <li key={d} className={`cg-pebble ${kind(d)}`} style={{ "--y": `${(Math.sin(((d - 1) / span) * Math.PI * 2) * 8).toFixed(1)}px` } as CSSProperties}>
            {d === shape.day && !compact && <span className="cg-tag">{t("common.today")}</span>}
            <span className="cg-pb" />
            {!compact && <span className="cg-n">{d}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
