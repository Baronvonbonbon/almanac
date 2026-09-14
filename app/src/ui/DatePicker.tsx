import { useState } from "react";
import type { ISODate } from "../cycle";
import { t } from "../i18n";
import { firstDayOfWeek, longDate, monthTitle, weekdayInitials } from "../i18n/format";

interface Props {
  value: ISODate | null;
  onChange(date: ISODate): void;
  min: ISODate;
  max: ISODate;
  today: ISODate;
}

type Month = { y: number; m: number };
const monthOf = (date: ISODate): Month => ({ y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) - 1 });
const index = ({ y, m }: Month) => y * 12 + m;
const dateIn = ({ y, m }: Month, day: number): ISODate => `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/**
 * A month of days to tap — rather than the phone's own date picker, which the Polkadot app's web view
 * has not been checked to open.
 */
export function DatePicker({ value, onChange, min, max, today }: Props) {
  const [shown, setShown] = useState<Month>(() => monthOf(value ?? max));
  const firstDay = firstDayOfWeek();
  const weekday = new Date(Date.UTC(shown.y, shown.m, 1)).getUTCDay() || 7; // 1 is Monday, 7 is Sunday
  const lead = (weekday - firstDay + 7) % 7;
  const daysInMonth = new Date(Date.UTC(shown.y, shown.m + 1, 0)).getUTCDate();
  const move = (delta: number) =>
    setShown((s) => {
      const i = index(s) + delta;
      return { y: Math.floor(i / 12), m: i % 12 };
    });
  const title = monthTitle(shown.y, shown.m);

  return (
    <div className="datepicker">
      <div className="dp-head">
        <button type="button" className="icon-button" onClick={() => move(-1)} disabled={index(shown) <= index(monthOf(min))} aria-label={t("common.earlierMonth")}>
          ‹
        </button>
        <h3 aria-live="polite">{title}</h3>
        <button type="button" className="icon-button" onClick={() => move(1)} disabled={index(shown) >= index(monthOf(max))} aria-label={t("common.laterMonth")}>
          ›
        </button>
      </div>
      <div className="dp-grid" role="group" aria-label={title}>
        {weekdayInitials(firstDay).map((w, i) => (
          <span key={`w${i}`} className="dp-weekday" aria-hidden="true">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = dateIn(shown, i + 1);
          return (
            <button
              key={date}
              type="button"
              className="dp-day"
              data-today={date === today || undefined}
              aria-pressed={date === value}
              aria-label={date === today ? `${longDate(date)}, ${t("common.today")}` : longDate(date)}
              disabled={date < min || date > max}
              onClick={() => onChange(date)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
