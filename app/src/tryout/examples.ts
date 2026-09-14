import { addDays, periodStarts, type DayEntry, type Flow, type ISODate } from "../cycle";
import { t } from "../i18n";

/**
 * Example months for the web tryout (docs/DESIGN.md §2), so a tester can see the calendar and
 * insights filled in: five cycles before the first period they logged — or, with none logged, ending
 * in a period that started nine days ago. Added only when asked for, never over a day the tester
 * logged, and never in the Polkadot app, where they would mix with real data.
 */

/** How far each example cycle strays from the usual length, most recent first — real cycles vary a little. */
const VARIATION = [1, -1, 2, 0, -2];

const PERIODS: Flow[][] = [
  ["medium", "heavy", "medium", "light", "spotting"],
  ["heavy", "heavy", "medium", "light"],
  ["medium", "heavy", "light", "light", "spotting"],
  ["light", "medium", "medium", "light"],
  ["medium", "heavy", "medium", "light", "light"],
  ["medium", "heavy", "medium", "light"],
];

export function exampleDays(entries: DayEntry[], today: ISODate, typicalCycle = 28, now = Date.now()): DayEntry[] {
  const usual = Math.min(Math.max(typicalCycle, 21), 45);
  const first = periodStarts(entries)[0];
  const starts = [first ?? addDays(today, -9)];
  for (const v of VARIATION) starts.unshift(addDays(starts[0], -(usual + v)));
  // With a period logged, it starts the cycle after the last example; without one, today ends them.
  if (first) starts.pop();
  const last = first ? addDays(first, -1) : today;

  const days = new Map<ISODate, DayEntry>();
  const add = (date: ISODate, fields: Omit<DayEntry, "date" | "updatedAt">) =>
    days.set(date, { ...days.get(date), ...fields, date, updatedAt: now });

  starts.forEach((start, i) => {
    PERIODS[i % PERIODS.length].forEach((flow, day) => add(addDays(start, day), { flow }));
    add(start, { symptoms: ["cramps", "fatigue"], mood: ["low"] });
    add(addDays(start, 1), { symptoms: ["cramps"] });
    add(addDays(start, 13), { mood: [i % 2 ? "happy" : "energetic"] });
    if (i === 2) add(addDays(start, 6), { mood: ["calm"], note: t("tryout.exampleNote") });
    const next = starts[i + 1] ?? first;
    if (next) add(addDays(next, -2), { symptoms: i % 2 ? ["bloating", "headache"] : ["bloating", "tender"], mood: ["irritable"] });
  });

  const logged = new Set(entries.map((e) => e.date));
  return [...days.values()].filter((e) => e.date <= last && !logged.has(e.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
}
