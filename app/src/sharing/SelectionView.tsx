import { detailLines } from "../calendar/marks";
import { daysBetween } from "../cycle";
import { t } from "../i18n";
import { monthTitle, shortDate, temperatureUnit } from "../i18n/format";
import type { Category, Selection, SharedDay } from "../share";

/**
 * What a share holds, as the provider sees it (docs/DESIGN.md §9) — and as the patient sees it first,
 * rendered from the very bytes that will be shared. It moves to the provider app with ../share.
 */

export const categoriesText = (categories: readonly Category[]): string => categories.map((c) => t(`sharing.categories.${c}`)).join(" · ");

/** "Mar 16 – Sep 15, 2026", with both years when the range crosses one. */
export const rangeText = (from: string, to: string): string =>
  t("sharing.view.range", { from: shortDate(from, from.slice(0, 4) !== to.slice(0, 4)), to: shortDate(to, true) });

const daysText = (n: number) => (n === 1 ? t("sharing.view.dayOne") : t("sharing.view.days", { n }));

function weeksText(since: string, made: string): string {
  const d = daysBetween(since, made);
  const w = Math.floor(d / 7);
  const weeks = w === 1 ? t("pregnancy.weekOne") : t("pregnancy.weeks", { n: w });
  if (d % 7 === 0) return weeks;
  return t("pregnancy.weeksAndDays", { weeks, days: d % 7 === 1 ? t("pregnancy.dayOne") : t("pregnancy.days", { n: d % 7 }) });
}

const dayText = (day: SharedDay, unit: "C" | "F") => [...detailLines(day, unit), ...(day.energy ? [t("sharing.view.energy", { n: day.energy })] : [])].join(" · ");

export function SelectionView({ selection: s }: { selection: Selection }) {
  const unit = temperatureUnit();
  const withYear = s.from.slice(0, 4) !== s.to.slice(0, 4);
  const months = new Map<string, [string, SharedDay][]>();
  for (const [date, day] of Object.entries(s.days).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const month = date.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), [date, day]]);
  }

  return (
    <div className="selection">
      <div>
        <p className="selection-range">{rangeText(s.from, s.to)}</p>
        <p className="selection-what">{categoriesText(s.categories)}</p>
      </div>

      {s.cycles && (
        <section aria-labelledby="sel-periods">
          <h3 id="sel-periods">{t("sharing.view.periods")}</h3>
          {s.cycles.length ? (
            <table className="selection-cycles">
              <thead>
                <tr>
                  <th scope="col">{t("sharing.view.started")}</th>
                  <th scope="col">{t("sharing.view.period")}</th>
                  <th scope="col">{t("sharing.view.cycle")}</th>
                </tr>
              </thead>
              <tbody>
                {s.cycles.map((c) => (
                  <tr key={c.start}>
                    <th scope="row">{shortDate(c.start, withYear)}</th>
                    <td>{c.period ? daysText(c.period) : "–"}</td>
                    <td>{c.length ? daysText(c.length) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>{t("sharing.view.noPeriods")}</p>
          )}
          {s.usual?.cycle && <p className="selection-note">{t("sharing.view.usualCycle", { n: s.usual.cycle })}</p>}
          {s.usual?.period && <p className="selection-note">{t("sharing.view.usualPeriod", { n: s.usual.period })}</p>}
        </section>
      )}

      {s.fertile && (
        <section aria-labelledby="sel-fertile">
          <h3 id="sel-fertile">{t("sharing.view.fertile")}</h3>
          <p>{t("sharing.view.fertileDays", { start: shortDate(s.fertile.start), end: shortDate(s.fertile.end), day: shortDate(s.fertile.ovulation) })}</p>
        </section>
      )}

      {s.pregnancy && (
        <section aria-labelledby="sel-pregnancy">
          <h3 id="sel-pregnancy">{t("sharing.view.pregnancy")}</h3>
          <p>{t("sharing.view.pregnancySince", { weeks: weeksText(s.pregnancy.since, s.made), date: shortDate(s.pregnancy.since, true) })}</p>
        </section>
      )}

      {months.size > 0 && (
        <section aria-labelledby="sel-daily">
          <h3 id="sel-daily">{t("sharing.view.daily")}</h3>
          {[...months].map(([month, days]) => (
            <div key={month}>
              <h4>{monthTitle(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1)}</h4>
              <ul className="selection-days">
                {days.map(([date, day]) => (
                  <li key={date}>
                    <span className="selection-date">{shortDate(date)}</span>
                    <span>{dayText(day, unit)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
