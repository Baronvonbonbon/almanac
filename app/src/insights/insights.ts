import { byDate, cycles, periodLengths, periodStarts, type Cycle, type DayEntry } from "../cycle";

export interface Insights {
  /** The last six cycles, newest first, including ones left out of predictions. */
  cycles: Cycle[];
  /** The middle half of counted cycle lengths, in days. */
  usual: [number, number] | null;
  periodDays: number | null;
  topSymptoms: { id: string; count: number }[];
}

/** Linear interpolation between order statistics, over an already sorted array. */
function quantile(sorted: number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const below = Math.floor(at);
  const above = Math.ceil(at);
  return sorted[below] + (sorted[above] - sorted[below]) * (at - below);
}

/** What the Insights tab shows — worked out on the phone from what was logged, nothing else. */
export function insightsOf(entries: DayEntry[]): Insights {
  const all = cycles(periodStarts(entries));
  const counted = all
    .filter((c) => c.counted)
    .map((c) => c.length)
    .sort((a, b) => a - b);
  const lengths = periodLengths(entries).sort((a, b) => a - b);
  const counts = new Map<string, number>();
  for (const e of byDate(entries)) for (const s of e.symptoms ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
  return {
    cycles: all.slice(-6).reverse(),
    usual: counted.length ? [Math.floor(quantile(counted, 0.25)), Math.ceil(quantile(counted, 0.75))] : null,
    periodDays: lengths.length ? Math.round(quantile(lengths, 0.5)) : null,
    topSymptoms: [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([id, count]) => ({ id, count })),
  };
}
