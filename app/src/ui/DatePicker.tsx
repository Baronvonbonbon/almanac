import { useState } from "react";
import type { ISODate } from "../cycle";
import { t } from "../i18n";
import { firstDayOfWeek, longDate, monthTitle, weekdayInitials } from "../i18n/format";
import { addMonths, dateIn, daysIn, leadingBlanks, monthIndex, monthOf, type Month } from "./months";

interface Props {
  value: ISODate | null;
  onChange(date: ISODate): void;
  min: ISODate;
  max: ISODate;
  today: ISODate;
}

/**
 * A month of days to tap — rather than the phone's own date picker, which the Polkadot app's web view
 * has not been checked to open.
 */
export function DatePicker({ value, onChange, min, max, today }: Props) {
  const [shown, setShown] = useState<Month>(() => monthOf(value ?? max));
  const firstDay = firstDayOfWeek();
  const title = monthTitle(shown.y, shown.m);

  return (
    <div className="datepicker">
      <div className="dp-head">
        <button type="button" className="icon-button" onClick={() => setShown(addMonths(shown, -1))} disabled={monthIndex(shown) <= monthIndex(monthOf(min))} aria-label={t("common.earlierMonth")}>
          ‹
        </button>
        <h3 aria-live="polite">{title}</h3>
        <button type="button" className="icon-button" onClick={() => setShown(addMonths(shown, 1))} disabled={monthIndex(shown) >= monthIndex(monthOf(max))} aria-label={t("common.laterMonth")}>
          ›
        </button>
      </div>
      <div className="dp-grid" role="group" aria-label={title}>
        {weekdayInitials(firstDay).map((w, i) => (
          <span key={`w${i}`} className="dp-weekday" aria-hidden="true">
            {w}
          </span>
        ))}
        {Array.from({ length: leadingBlanks(shown, firstDay) }, (_, i) => (
          <span key={`b${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysIn(shown) }, (_, i) => {
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
