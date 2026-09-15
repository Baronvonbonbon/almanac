import { addDays, periodLengths, periodStarts, type DayEntry, type Flow, type ISODate, type Prediction } from "../cycle";
import { t } from "../i18n";
import { inUnit, moodName, symptomName } from "../log/entry";
import { dateIn, daysIn, type Month } from "../ui/months";

/** How many cycles ahead the calendar shows likely periods for. */
export const CYCLES_AHEAD = 3;
const DEFAULT_PERIOD_DAYS = 5;

export interface Forecast {
  /** Period starts, as almanac reads them from what was logged. */
  starts: Set<ISODate>;
  /** Days the period is likely, from tomorrow on. */
  predicted: Set<ISODate>;
  /** The fertile window, when that mode is on — always an estimate. */
  fertile: Set<ISODate>;
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/**
 * What the calendar marks beyond what was logged: the next few periods, each as long as your periods
 * usually are, and the fertile window. Nothing ahead while a period is late or predictions are
 * paused — a guess stacked on a missed guess would only mislead.
 */
export function forecast(entries: DayEntry[], prediction: Prediction, today: ISODate, typicalPeriod?: number): Forecast {
  const starts = new Set(periodStarts(entries));
  const predicted = new Set<ISODate>();
  const fertile = new Set<ISODate>();
  const { next, cycleLength, late, fertile: window } = prediction;
  if (next && cycleLength && !late) {
    const lengths = periodLengths(entries);
    const periodDays = lengths.length ? median(lengths) : (typicalPeriod ?? DEFAULT_PERIOD_DAYS);
    for (let k = 0; k < CYCLES_AHEAD; k++) {
      const start = addDays(next.likely, k * cycleLength);
      for (let d = 0; d < periodDays; d++) {
        const date = addDays(start, d);
        if (date > today) predicted.add(date);
      }
      if (window) {
        const end = addDays(window.end, k * cycleLength);
        for (let date = addDays(window.start, k * cycleLength); date <= end; date = addDays(date, 1)) fertile.add(date);
      }
    }
  }
  return { starts, predicted, fertile };
}

export interface DayCell {
  date: ISODate;
  day: number;
  flow?: Flow;
  start: boolean;
  predicted: boolean;
  fertile: boolean;
  /** Anything besides flow: symptoms, mood, a note, trying-to-conceive details. */
  logged: boolean;
  today: boolean;
  future: boolean;
}

const hasDetails = (e: DayEntry) => !!(e.symptoms?.length || e.mood?.length || e.note || (e.fertility && Object.keys(e.fertility).length) || e.intimacy);

export function monthCells(month: Month, days: Map<ISODate, DayEntry>, fc: Forecast, today: ISODate): DayCell[] {
  return Array.from({ length: daysIn(month) }, (_, i) => {
    const date = dateIn(month, i + 1);
    const entry = days.get(date);
    return {
      date,
      day: i + 1,
      flow: entry?.flow,
      start: fc.starts.has(date),
      predicted: fc.predicted.has(date),
      fertile: fc.fertile.has(date),
      logged: !!entry && hasDetails(entry),
      today: date === today,
      future: date > today,
    };
  });
}

/** Everything logged on a day, one line each, for the calendar's day detail — and a shared day's, in a share. */
export function detailLines(entry: Pick<DayEntry, "flow" | "symptoms" | "mood" | "fertility" | "intimacy" | "note"> | undefined, unit: "C" | "F"): string[] {
  if (!entry) return [];
  const lines: string[] = [];
  const detail = (label: string, value: string) => lines.push(t("calendar.detail", { label, value }));
  if (entry.flow) lines.push(t(`log.flowSummary.${entry.flow}`));
  if (entry.symptoms?.length) lines.push(entry.symptoms.map(symptomName).join(", "));
  if (entry.mood?.length) lines.push(t("calendar.mood", { list: entry.mood.map(moodName).join(", ") }));
  const f = entry.fertility;
  if (f?.lhTest) detail(t("log.ttc.lhTest"), t(`log.ttc.lh.${f.lhTest}`));
  if (f?.temperatureC !== undefined) detail(t("log.ttc.temperature"), `${inUnit(f.temperatureC, unit)} °${unit}`);
  if (f?.fluid) detail(t("log.ttc.fluid"), t(`log.ttc.fluids.${f.fluid}`));
  if (entry.intimacy) detail(t("log.ttc.intimacy"), t(`log.ttc.intimacyOptions.${entry.intimacy.protected === false ? "unprotected" : "protected"}`));
  if (entry.note) lines.push(`“${entry.note}”`);
  return lines;
}
