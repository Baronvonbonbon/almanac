import { addDays, daysBetween, type DayEntry, type ISODate, type Prediction } from "../cycle";

/**
 * What a cycle graphic draws (docs/DESIGN.md §4), in cycle days: day 1 is the first day of the latest
 * period. The same shape feeds all three looks' graphics — the ring, the dial and the pebble path.
 */
export interface CycleShape {
  day: number;
  length: number;
  /** Days 1 to `periodDays` are drawn as the period: day 1, and each logged day with flow after it. */
  periodDays: number;
  /** Opt-in, and always an estimate. */
  fertile?: [number, number];
  /** Where the next period is likely to start. */
  likely?: [number, number];
}

/** `null` until almanac knows when the latest period started. */
export function cycleShape(prediction: Prediction, entries: DayEntry[], today: ISODate): CycleShape | null {
  const { cycleDay, cycleLength, fertile, next } = prediction;
  if (!cycleDay || !cycleLength) return null;
  const start = addDays(today, 1 - cycleDay);
  const at = (date: ISODate) => daysBetween(start, date) + 1;
  const flow = new Set(entries.filter((e) => e.flow).map((e) => e.date));
  let periodDays = 1;
  while (periodDays < cycleDay && flow.has(addDays(start, periodDays))) periodDays++;
  return {
    day: cycleDay,
    length: cycleLength,
    periodDays,
    fertile: fertile && at(fertile.end) >= 1 ? [Math.max(1, at(fertile.start)), at(fertile.end)] : undefined,
    likely: next ? [at(next.earliest), at(next.latest)] : undefined,
  };
}

/** How many days a graphic lays out: the cycle, stretched when today or the likely start runs past it. */
export const spanOf = (shape: CycleShape): number => Math.max(shape.length, shape.day, shape.likely?.[1] ?? 0);

export const within = (day: number, range?: [number, number]): boolean => !!range && day >= range[0] && day <= range[1];
