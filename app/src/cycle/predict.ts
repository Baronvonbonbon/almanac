import { addDays, daysBetween, type ISODate } from "./dates";
import { cycles, periodStarts } from "./periods";
import type { DayEntry } from "./types";

/** How many recent cycles predictions look at. */
export const RECENT_CYCLES = 6;
/** Above this standard deviation, in days, cycles count as irregular. */
export const IRREGULAR_SD = 7;
/** Days from ovulation to the next period — an average, which is why the fertile window is an estimate. */
export const LUTEAL_DAYS = 14;

export interface PredictOptions {
  today: ISODate;
  /** What the user said at onboarding, if anything. */
  typicalCycle?: number;
  fertility?: boolean;
  pregnancy?: boolean;
}

export interface Prediction {
  /** none — no period logged yet. learning — fewer than two cycles. paused — pregnancy mode. */
  status: "none" | "learning" | "ready" | "paused";
  /** Today's day in the current cycle; day 1 is the first day of the latest period. */
  cycleDay?: number;
  cycleLength?: number;
  next?: { likely: ISODate; earliest: ISODate; latest: ISODate };
  /** Days past `next.latest`, once today is later than that. */
  late?: number;
  irregular?: boolean;
  /** Opt-in, and always an estimate. */
  fertile?: { start: ISODate; end: ISODate; ovulation: ISODate };
  /** Cycle lengths left out of predictions because they were under 15 or over 90 days. */
  setAside: number[];
  /** In pregnancy mode: the first day of the last period, which the weeks are counted from. */
  since?: ISODate;
}

export function predict(entries: DayEntry[], options: PredictOptions): Prediction {
  const starts = periodStarts(entries.filter((e) => e.date <= options.today));
  if (options.pregnancy) return starts.length ? { status: "paused", since: starts[starts.length - 1], setAside: [] } : { status: "paused", setAside: [] };
  if (!starts.length) return { status: "none", setAside: [] };

  const all = cycles(starts);
  const setAside = all.filter((c) => !c.counted).map((c) => c.length);
  const recent = all.filter((c) => c.counted).map((c) => c.length).slice(-RECENT_CYCLES);
  const last = starts[starts.length - 1];

  let length: number;
  let low: number;
  let high: number;
  let irregular = false;
  if (recent.length < 2) {
    length = options.typicalCycle ?? recent[0] ?? 28;
    low = length - 3;
    high = length + 3;
  } else {
    const sorted = [...recent].sort((a, b) => a - b);
    length = Math.round(quantile(sorted, 0.5));
    low = Math.min(Math.floor(quantile(sorted, 0.25)), length - 1);
    high = Math.max(Math.ceil(quantile(sorted, 0.75)), length + 1);
    if (recent.length < 3) {
      low = Math.min(low, length - 2);
      high = Math.max(high, length + 2);
    }
    irregular = standardDeviation(recent) > IRREGULAR_SD;
    if (irregular) {
      low = Math.min(low, sorted[0]);
      high = Math.max(high, sorted[sorted.length - 1]);
    }
  }

  const next = { likely: addDays(last, length), earliest: addDays(last, low), latest: addDays(last, high) };
  const prediction: Prediction = {
    status: recent.length < 2 ? "learning" : "ready",
    cycleDay: daysBetween(last, options.today) + 1,
    cycleLength: length,
    next,
    irregular,
    setAside,
  };
  if (options.today > next.latest) prediction.late = daysBetween(next.latest, options.today);
  if (options.fertility) {
    const ovulation = addDays(next.likely, -LUTEAL_DAYS);
    prediction.fertile = { start: addDays(ovulation, -5), end: addDays(ovulation, 1), ovulation };
  }
  return prediction;
}

/** Linear interpolation between order statistics, over an already sorted array. */
function quantile(sorted: number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const below = Math.floor(at);
  const above = Math.ceil(at);
  return sorted[below] + (sorted[above] - sorted[below]) * (at - below);
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}
