import { useMemo, useState, type CSSProperties } from "react";
import { addDays, type DayEntry, type ISODate } from "../cycle";
import { t } from "../i18n";
import { firstDayOfWeek, longDate, monthTitle, temperatureUnit, weekdayInitials } from "../i18n/format";
import type { CycleData } from "../shell/useCycle";
import { addMonths, leadingBlanks, monthIndex, monthOf, type Month } from "../ui/months";
import { detailLines, forecast, monthCells, type DayCell, type Forecast } from "./marks";
import "./calendar.css";

/** How far up a day's cell the period colour fills: the level carries the meaning, not only the colour. */
const FILL = { spotting: 15, light: 28, medium: 42, heavy: 58 };

interface Props {
  data: CycleData;
  onLog(date: ISODate): void;
  onSave(entry: DayEntry): Promise<void>;
}

/** docs/DESIGN.md §3: a month; period days filled, likely days outlined, the fertile window patterned. */
export function CalendarView({ data, onLog, onSave }: Props) {
  const firstDay = useMemo(firstDayOfWeek, []);
  const current = monthOf(data.today);
  const [shown, setShown] = useState<Month>(current);
  const [selected, setSelected] = useState<ISODate>(data.today);
  const fc = useMemo(() => forecast(data.entries, data.prediction, data.today, data.settings.typicalPeriod), [data]);
  const earliest = data.entries[0]?.date;
  const minMonth = Math.min(earliest ? monthIndex(monthOf(earliest)) : Infinity, monthIndex(addMonths(current, -12)));
  const maxMonth = monthIndex(addMonths(current, 3));
  const cells = monthCells(shown, data.days, fc, data.today);

  return (
    <section className="cal" aria-labelledby="cal-title">
      <div className="cal-head">
        <button type="button" className="icon-button" onClick={() => setShown(addMonths(shown, -1))} disabled={monthIndex(shown) <= minMonth} aria-label={t("common.earlierMonth")}>
          ‹
        </button>
        <h2 id="cal-title" aria-live="polite">
          {monthTitle(shown.y, shown.m)}
        </h2>
        <button type="button" className="icon-button" onClick={() => setShown(addMonths(shown, 1))} disabled={monthIndex(shown) >= maxMonth} aria-label={t("common.laterMonth")}>
          ›
        </button>
      </div>

      <div className="cal-grid" role="group" aria-labelledby="cal-title">
        {weekdayInitials(firstDay).map((w, i) => (
          <span key={`w${i}`} className="cal-weekday" aria-hidden="true">
            {w}
          </span>
        ))}
        {Array.from({ length: leadingBlanks(shown, firstDay) }, (_, i) => (
          <span key={`b${i}`} aria-hidden="true" />
        ))}
        {cells.map((cell) => (
          <button
            key={cell.date}
            type="button"
            className={classes(cell)}
            aria-pressed={cell.date === selected}
            aria-label={label(cell)}
            style={cell.flow ? ({ "--fill": `${FILL[cell.flow]}%` } as CSSProperties) : undefined}
            onClick={() => setSelected(cell.date)}
          >
            {cell.flow && <span className="cal-fill" />}
            <span className="cal-n">{cell.day}</span>
          </button>
        ))}
      </div>

      <div className="cal-legend" aria-hidden="true">
        <span>
          <i className="lg lg-period" />
          {t("calendar.legend.period")}
        </span>
        <span>
          <i className="lg lg-likely" />
          {t("calendar.legend.likely")}
        </span>
        {data.settings.modes.fertility && (
          <span>
            <i className="lg lg-fertile" />
            {t("calendar.legend.fertile")}
          </span>
        )}
        <span>
          <i className="lg lg-logged" />
          {t("calendar.legend.logged")}
        </span>
      </div>

      <DayDetail date={selected} data={data} fc={fc} onLog={onLog} onSave={onSave} />
    </section>
  );
}

const classes = (c: DayCell) =>
  ["cal-day", c.predicted && "predicted", c.fertile && "fertile", c.logged && "logged", c.today && "is-today", c.future && "future"].filter(Boolean).join(" ");

const label = (c: DayCell) =>
  [
    longDate(c.date),
    c.flow && t(`log.flowSummary.${c.flow}`),
    c.start && t("calendar.startedHere"),
    c.predicted && t("calendar.legend.likely"),
    c.fertile && t("calendar.legend.fertile"),
    c.logged && t("calendar.legend.logged"),
    c.today && t("common.today"),
  ]
    .filter(Boolean)
    .join(", ");

function DayDetail({ date, data, fc, onLog, onSave }: { date: ISODate; data: CycleData; fc: Forecast } & Pick<Props, "onLog" | "onSave">) {
  const entry = data.days.get(date);
  const lines = detailLines(entry, temperatureUnit());
  const isStart = fc.starts.has(date);
  const flowing = !!entry?.flow && entry.flow !== "spotting";
  const marks = [isStart && t("calendar.startedHere"), fc.predicted.has(date) && t("calendar.likelyHere"), fc.fertile.has(date) && t("prediction.fertile")].filter(
    (m): m is string => !!m,
  );

  // Corrects how almanac reads period starts. A start given with no flow (onboarding's) is simply
  // removed; otherwise the day records the correction, which detection then follows.
  async function setStart(start: boolean) {
    const next: DayEntry = { ...entry, date, updatedAt: Date.now() };
    if (!start && entry?.periodStart === true && !flowing) delete next.periodStart;
    else next.periodStart = start;
    await onSave(next);
  }

  return (
    <div className="cal-detail" aria-live="polite">
      <h3>{date === data.today ? t("common.today") : date === addDays(data.today, -1) ? t("log.yesterday") : longDate(date)}</h3>
      {marks.map((m) => (
        <p key={m} className="cal-mark">
          {m}
        </p>
      ))}
      {lines.length ? (
        <ul>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="cal-quiet">{t("calendar.nothing")}</p>
      )}
      {date <= data.today ? (
        <div className="cal-actions">
          <button type="button" className="button secondary" onClick={() => onLog(date)}>
            {entry ? t("calendar.editDay") : t("calendar.logDay")}
          </button>
          {isStart ? (
            <button type="button" className="link-button" onClick={() => void setStart(false)}>
              {t("calendar.notStart")}
            </button>
          ) : (
            flowing && (
              <button type="button" className="link-button" onClick={() => void setStart(true)}>
                {t("calendar.isStart")}
              </button>
            )
          )}
        </div>
      ) : (
        <p className="cal-quiet">{t("calendar.future")}</p>
      )}
    </div>
  );
}
