import { describe, expect, it } from "vitest";
import { periodStarts, predict, type DayEntry } from "../cycle";
import { DEFAULT_SETTINGS } from "../data";
import { decoyRecords } from "./protection";

const TODAY = "2026-09-14";
const settings = { ...DEFAULT_SETTINGS, modes: { fertility: true, ttc: false, pregnancy: false }, typicalCycle: 30 };

describe("the decoy's first records", () => {
  it("copy the real settings, so the second almanac is set up the same way", () => {
    expect(decoyRecords(settings, { fill: false, usualCycle: 30, today: TODAY })).toEqual({ settings });
  });

  it("can hold example months near the usual length, as month records", () => {
    const records = decoyRecords(settings, { fill: true, usualCycle: 31, today: TODAY, now: 7 });
    const months = Object.keys(records).filter((name) => name.startsWith("m/"));
    expect(months.length).toBeGreaterThanOrEqual(5);
    const days = months.flatMap((name) => Object.values(records[name] as Record<string, DayEntry>));
    expect(periodStarts(days)).toHaveLength(6);
    expect(predict(days, { today: TODAY })).toMatchObject({ status: "ready", cycleLength: 31 });
  });
});
