import { daysBetween, type ISODate } from "./dates";
import type { DayEntry } from "./types";

/** A period starts on the first flow day after at least this many days without flow. */
export const MIN_GAP_DAYS = 10;

/** Cycle lengths outside this range are kept, but left out of predictions. */
export const COUNTED_LENGTHS = { min: 15, max: 90 };

// Spotting alone neither starts a period nor keeps one going.
const counts = (e: DayEntry) => e.flow === "light" || e.flow === "medium" || e.flow === "heavy";

/** One entry per date — the most recently updated — in date order. */
export function byDate(entries: DayEntry[]): DayEntry[] {
  const latest = new Map<ISODate, DayEntry>();
  for (const e of entries) {
    const seen = latest.get(e.date);
    if (!seen || e.updatedAt >= seen.updatedAt) latest.set(e.date, e);
  }
  return [...latest.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function periodStarts(entries: DayEntry[]): ISODate[] {
  const starts: ISODate[] = [];
  let lastFlow: ISODate | null = null;
  for (const e of byDate(entries)) {
    if (e.periodStart === true) {
      starts.push(e.date);
      lastFlow = e.date;
      continue;
    }
    if (!counts(e)) continue;
    const afterGap = lastFlow === null || daysBetween(lastFlow, e.date) - 1 >= MIN_GAP_DAYS;
    if (afterGap && e.periodStart !== false) starts.push(e.date);
    lastFlow = e.date;
  }
  return starts;
}

export interface Cycle {
  start: ISODate;
  length: number;
  /** Within COUNTED_LENGTHS, so used for predictions. */
  counted: boolean;
}

export function cycles(starts: ISODate[]): Cycle[] {
  return starts.slice(1).map((next, i) => {
    const length = daysBetween(starts[i], next);
    return { start: starts[i], length, counted: length >= COUNTED_LENGTHS.min && length <= COUNTED_LENGTHS.max };
  });
}
