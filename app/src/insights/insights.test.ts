import { describe, expect, it } from "vitest";
import { addDays, type DayEntry } from "../cycle";
import { insightsOf } from "./insights";

const period = (start: string, days = 5, symptoms?: string[]): DayEntry[] =>
  Array.from({ length: days }, (_, i) => ({ date: addDays(start, i), flow: "light" as const, updatedAt: 1, ...(i === 0 && symptoms ? { symptoms } : {}) }));

describe("insights", () => {
  it("lists recent cycles newest first, with the usual lengths", () => {
    const entries = [
      ...period("2026-05-05", 5, ["cramps"]),
      ...period("2026-06-03", 4, ["cramps", "headache"]),
      ...period("2026-07-01", 5, ["headache"]),
      ...period("2026-07-30", 6, ["cramps"]),
      ...period("2026-08-28"),
    ];
    const ins = insightsOf(entries);
    expect(ins.cycles.map((c) => [c.start, c.length])).toEqual([
      ["2026-07-30", 29],
      ["2026-07-01", 29],
      ["2026-06-03", 28],
      ["2026-05-05", 29],
    ]);
    expect(ins.usual).toEqual([28, 29]);
    expect(ins.periodDays).toBe(5);
    expect(ins.topSymptoms).toEqual([
      { id: "cramps", count: 3 },
      { id: "headache", count: 2 },
    ]);
  });

  it("shows a very long cycle but leaves it out of the usual length", () => {
    const ins = insightsOf([...period("2026-01-05"), ...period("2026-04-10"), ...period("2026-05-08"), ...period("2026-06-06")]);
    expect(ins.cycles.at(-1)).toMatchObject({ start: "2026-01-05", length: 95, counted: false });
    expect(ins.usual).toEqual([28, 29]);
  });

  it("has nothing to say before a whole cycle", () => {
    expect(insightsOf(period("2026-09-01"))).toEqual({ cycles: [], usual: null, periodDays: 5, topSymptoms: [] });
  });
});
