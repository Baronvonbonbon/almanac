import { describe, expect, it } from "vitest";
import { predict, type DayEntry } from "../cycle";
import { cycleShape, spanOf } from "./shape";

const TODAY = "2026-09-14";

describe("cycle shape", () => {
  it("draws the latest period, the fertile window and the likely start in cycle days", () => {
    const flows = ["medium", "heavy", "medium", "light", "spotting"] as const;
    const entries: DayEntry[] = ["2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01"].map((date, i) => ({
      date,
      flow: flows[i],
      updatedAt: 1,
    }));
    const prediction = predict(entries, { today: TODAY, typicalCycle: 29, fertility: true });
    const shape = cycleShape(prediction, entries, TODAY)!;
    expect(shape).toMatchObject({ day: 18, length: 29, periodDays: 5 });
    // The next period's day 1 is cycle day 30; the likely range brackets it.
    expect(shape.likely![0]).toBeLessThanOrEqual(30);
    expect(shape.likely![1]).toBeGreaterThanOrEqual(30);
    expect(shape.fertile![0]).toBeLessThan(shape.fertile![1]);
    expect(spanOf(shape)).toBe(Math.max(29, shape.likely![1]));
  });

  it("marks only day 1 as the period when just a start date is known, as after onboarding", () => {
    const entries: DayEntry[] = [{ date: "2026-09-10", periodStart: true, updatedAt: 1 }];
    const shape = cycleShape(predict(entries, { today: TODAY }), entries, TODAY)!;
    expect(shape).toMatchObject({ day: 5, length: 28, periodDays: 1 });
    expect(shape.fertile).toBeUndefined();
  });

  it("stretches to today when a period is late", () => {
    const entries: DayEntry[] = [{ date: "2026-08-01", periodStart: true, updatedAt: 1 }];
    const shape = cycleShape(predict(entries, { today: TODAY, typicalCycle: 28 }), entries, TODAY)!;
    expect(shape.day).toBe(45);
    expect(spanOf(shape)).toBeGreaterThanOrEqual(45);
  });

  it("draws nothing before a period is known", () => {
    expect(cycleShape(predict([], { today: TODAY }), [], TODAY)).toBeNull();
  });
});
