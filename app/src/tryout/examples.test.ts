import { describe, expect, it } from "vitest";
import { periodStarts, predict, type DayEntry } from "../cycle";
import { exampleDays } from "./examples";

const TODAY = "2026-09-14";

describe("example months for the tryout", () => {
  it("fills five cycles before the first period logged, and predictions learn from them", () => {
    const mine: DayEntry[] = [{ date: "2026-09-01", periodStart: true, updatedAt: 1 }];
    const examples = exampleDays(mine, TODAY, 28, 5);
    expect(examples.every((e) => e.date < "2026-09-01" && e.updatedAt === 5)).toBe(true);
    const all = [...examples, ...mine];
    expect(periodStarts(all)).toHaveLength(6);
    expect(predict(all, { today: TODAY })).toMatchObject({ status: "ready", cycleDay: 14, cycleLength: 28, irregular: false, setAside: [] });
  });

  it("with nothing logged, ends in a period that started nine days ago, and nothing after today", () => {
    const examples = exampleDays([], TODAY);
    expect(periodStarts(examples).at(-1)).toBe("2026-09-05");
    expect(examples.every((e) => e.date <= TODAY)).toBe(true);
    expect(predict(examples, { today: TODAY })).toMatchObject({ status: "ready", cycleDay: 10 });
  });

  it("follows the usual length given, within reason", () => {
    const usual = (typical: number) => predict(exampleDays([], TODAY, typical), { today: TODAY }).cycleLength;
    expect(usual(33)).toBe(33);
    expect(usual(60)).toBe(45);
  });

  it("never replaces a day the tester logged", () => {
    const mine: DayEntry[] = [{ date: "2026-09-06", mood: ["calm"], updatedAt: 1 }];
    expect(exampleDays(mine, TODAY).some((e) => e.date === "2026-09-06")).toBe(false);
  });
});
