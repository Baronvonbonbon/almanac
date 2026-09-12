import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays, daysBetween, fromDay, periodStarts, predict, toDay, type DayEntry, type ISODate } from ".";

const FIRST = "2025-01-06";

/** A history with a `periodDays`-long period at the start of each cycle, plus the period after the last. */
function history(lengths: number[], periodDays = 5, first: ISODate = FIRST): DayEntry[] {
  const entries: DayEntry[] = [];
  let start = toDay(first);
  for (const length of [...lengths, 0]) {
    for (let d = 0; d < periodDays; d++) entries.push({ date: fromDay(start + d), flow: d < 2 ? "heavy" : "light", updatedAt: 0 });
    start += length;
  }
  return entries;
}

const lastStart = (lengths: number[], first: ISODate = FIRST) => addDays(first, lengths.reduce((a, b) => a + b, 0));

describe("dates", () => {
  it("round-trips calendar dates and rejects impossible ones", () => {
    expect(fromDay(toDay("2028-02-29"))).toBe("2028-02-29");
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
    for (const bad of ["2026-02-30", "2026-13-01", "26-01-01", "2026-1-1"]) expect(() => toDay(bad)).toThrow(RangeError);
  });
});

describe("period starts", () => {
  it("starts a period after ten days without flow, not before", () => {
    const entries: DayEntry[] = [
      { date: "2026-03-01", flow: "heavy", updatedAt: 0 },
      { date: "2026-03-02", flow: "light", updatedAt: 0 },
      { date: "2026-03-10", flow: "light", updatedAt: 0 }, // 7 dry days: same period
      { date: "2026-03-21", flow: "medium", updatedAt: 0 }, // 10 dry days: a new one
    ];
    expect(periodStarts(entries)).toEqual(["2026-03-01", "2026-03-21"]);
  });

  it("never starts a period on spotting alone", () => {
    expect(periodStarts([{ date: "2026-03-01", flow: "spotting", updatedAt: 0 }])).toEqual([]);
  });

  it("follows the user's overrides", () => {
    const entries: DayEntry[] = [
      { date: "2026-03-01", flow: "spotting", periodStart: true, updatedAt: 0 },
      { date: "2026-04-01", flow: "light", periodStart: false, updatedAt: 0 },
    ];
    expect(periodStarts(entries)).toEqual(["2026-03-01"]);
  });

  it("uses the latest edit of a day", () => {
    const entries: DayEntry[] = [
      { date: "2026-03-01", flow: "heavy", updatedAt: 1 },
      { date: "2026-03-01", flow: "spotting", updatedAt: 2 },
    ];
    expect(periodStarts(entries)).toEqual([]);
  });
});

describe("predictions — fixtures", () => {
  it("regular: 28 days, a tight range", () => {
    const lengths = [28, 28, 28, 28, 28, 28];
    const today = addDays(lastStart(lengths), 10);
    const p = predict(history(lengths), { today });
    expect(p.status).toBe("ready");
    expect(p.cycleDay).toBe(11);
    expect(p.next).toEqual({
      likely: addDays(lastStart(lengths), 28),
      earliest: addDays(lastStart(lengths), 27),
      latest: addDays(lastStart(lengths), 29),
    });
    expect(p.irregular).toBe(false);
  });

  it("irregular: a wide range, spanning the shortest and longest recent cycles", () => {
    const lengths = [22, 40, 26, 45, 24, 38];
    const p = predict(history(lengths), { today: lastStart(lengths) });
    expect(p.irregular).toBe(true);
    expect(p.next!.earliest).toBe(addDays(lastStart(lengths), 22));
    expect(p.next!.latest).toBe(addDays(lastStart(lengths), 45));
  });

  it("PCOS-like long, variable cycles: the median, never an alarm", () => {
    const lengths = [45, 60, 38, 72, 50];
    const p = predict(history(lengths), { today: lastStart(lengths) });
    expect(p.status).toBe("ready");
    expect(p.cycleLength).toBe(50);
    expect(p.irregular).toBe(true);
  });

  it("a postpartum gap is set aside, and the rest still predict", () => {
    const lengths = [28, 29, 150, 30, 28];
    const p = predict(history(lengths), { today: lastStart(lengths) });
    expect(p.setAside).toEqual([150]);
    expect(p.cycleLength).toBe(29); // median of 28, 29, 30, 28
  });

  it("one cycle: still learning, using the stated length if there is one", () => {
    const today = lastStart([31]);
    expect(predict(history([31]), { today })).toMatchObject({ status: "learning", cycleLength: 31 });
    expect(predict(history([31]), { today, typicalCycle: 26 })).toMatchObject({ status: "learning", cycleLength: 26 });
    const p = predict(history([31]), { today });
    expect(daysBetween(p.next!.earliest, p.next!.latest)).toBe(6);
  });

  it("one period and no cycles: learning from 28, or the stated length", () => {
    expect(predict(history([]), { today: FIRST })).toMatchObject({ status: "learning", cycleLength: 28 });
    expect(predict(history([]), { today: FIRST, typicalCycle: 32 })).toMatchObject({ cycleLength: 32 });
  });

  it("nothing logged: no prediction", () => {
    expect(predict([], { today: FIRST })).toEqual({ status: "none", setAside: [] });
  });

  it("pregnancy mode pauses predictions", () => {
    expect(predict(history([28, 28, 28]), { today: FIRST, pregnancy: true }).status).toBe("paused");
  });

  it("says how late, once today is past the range", () => {
    const lengths = [28, 28, 28];
    const p = predict(history(lengths), { today: addDays(lastStart(lengths), 33) });
    expect(p.late).toBe(4);
  });

  it("ignores entries dated after today", () => {
    const lengths = [28, 28, 28];
    const today = addDays(lastStart(lengths), -1);
    expect(predict(history(lengths), { today }).cycleDay).toBe(28);
  });

  it("estimates the fertile window only when asked", () => {
    const lengths = [28, 28, 28];
    const today = lastStart(lengths);
    expect(predict(history(lengths), { today }).fertile).toBeUndefined();
    const { fertile, next } = predict(history(lengths), { today, fertility: true });
    expect(fertile!.ovulation).toBe(addDays(next!.likely, -14));
    expect(fertile!.start).toBe(addDays(fertile!.ovulation, -5));
    expect(fertile!.end).toBe(addDays(fertile!.ovulation, 1));
  });
});

describe("predictions — properties", () => {
  const counted = fc.integer({ min: 15, max: 90 });

  it("constant cycles predict exactly, within a day either way", () => {
    fc.assert(
      fc.property(fc.integer({ min: 21, max: 35 }), fc.integer({ min: 3, max: 8 }), (length, n) => {
        const lengths = Array<number>(n).fill(length);
        const p = predict(history(lengths, 4), { today: lastStart(lengths) });
        const likely = addDays(lastStart(lengths), length);
        return p.next!.likely === likely && p.next!.earliest === addDays(likely, -1) && p.next!.latest === addDays(likely, 1);
      }),
    );
  });

  it("the likely day always sits inside the range", () => {
    fc.assert(
      fc.property(fc.array(counted, { maxLength: 10 }), (lengths) => {
        const { next } = predict(history(lengths, 4), { today: lastStart(lengths) });
        return next!.earliest <= next!.likely && next!.likely <= next!.latest;
      }),
    );
  });

  it("does not depend on the order entries arrive in", () => {
    fc.assert(
      fc.property(fc.array(counted, { minLength: 1, maxLength: 8 }), (lengths) => {
        const entries = history(lengths, 4);
        const today = lastStart(lengths);
        expect(predict([...entries].reverse(), { today })).toEqual(predict(entries, { today }));
      }),
    );
  });

  it("sets aside exactly the cycles over 90 days", () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(counted, fc.integer({ min: 91, max: 400 })), { minLength: 1, maxLength: 8 }), (lengths) => {
        const p = predict(history(lengths, 4), { today: lastStart(lengths) });
        expect(p.setAside).toEqual(lengths.filter((l) => l > 90));
      }),
    );
  });
});
