import { describe, expect, it } from "vitest";
import { addDays, predict, type DayEntry } from "../cycle";
import { detailLines, forecast, monthCells } from "./marks";

const TODAY = "2026-09-14";
// Five periods about 29 days apart, five days each; the latest started on Aug 28.
const entries: DayEntry[] = ["2026-05-05", "2026-06-03", "2026-07-01", "2026-07-30", "2026-08-28"].flatMap((start) =>
  [0, 1, 2, 3, 4].map((i) => ({ date: addDays(start, i), flow: "light" as const, updatedAt: 1 })),
);
const days = new Map(entries.map((e) => [e.date, e]));

describe("the calendar's marks", () => {
  it("marks the next three periods, as long as periods usually last, from tomorrow on", () => {
    const prediction = predict(entries, { today: TODAY });
    const fc = forecast(entries, prediction, TODAY);
    expect(prediction.next!.likely).toBe("2026-09-26");
    expect([...fc.predicted].slice(0, 5)).toEqual(["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"]);
    expect(fc.predicted.size).toBe(15);
    expect([...fc.predicted].every((d) => d > TODAY)).toBe(true);
    expect(fc.starts.has("2026-08-28")).toBe(true);
    expect(fc.fertile.size).toBe(0);
  });

  it("marks the fertile window only when that mode is on", () => {
    const prediction = predict(entries, { today: TODAY, fertility: true });
    const fc = forecast(entries, prediction, TODAY);
    expect(fc.fertile.has(prediction.fertile!.start)).toBe(true);
    expect(fc.fertile.size).toBe(21);
  });

  it("marks nothing ahead while a period is late", () => {
    const late = "2026-10-20";
    const fc = forecast(entries, predict(entries, { today: late }), late);
    expect(fc.predicted.size).toBe(0);
  });

  it("lays out a month, flagging what each day holds", () => {
    const fc = forecast(entries, predict(entries, { today: TODAY }), TODAY);
    const cells = monthCells({ y: 2026, m: 8 }, days, fc, TODAY);
    expect(cells).toHaveLength(30);
    expect(cells[0]).toMatchObject({ date: "2026-09-01", flow: "light", logged: false, future: false });
    expect(cells[13]).toMatchObject({ date: "2026-09-14", today: true });
    expect(cells[25]).toMatchObject({ date: "2026-09-26", predicted: true, future: true });
  });

  it("spells out a day's log, temperature in the phone's unit", () => {
    const entry: DayEntry = {
      date: TODAY,
      flow: "medium",
      symptoms: ["cramps", "tender"],
      mood: ["calm"],
      fertility: { lhTest: "positive", temperatureC: 36.5 },
      intimacy: { protected: false },
      note: "walked",
      updatedAt: 1,
    };
    expect(detailLines(entry, "F")).toEqual([
      "Medium flow",
      "Cramps, Tender breasts",
      "Mood: Calm",
      "Ovulation test: Positive",
      "Temperature on waking: 97.7 °F",
      "Sex: Unprotected",
      "“walked”",
    ]);
    expect(detailLines(undefined, "C")).toEqual([]);
  });
});
