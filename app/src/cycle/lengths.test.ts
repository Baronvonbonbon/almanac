import { describe, expect, it } from "vitest";
import { periodLengths, type DayEntry, type Flow } from ".";

const day = (date: string, flow: Flow): DayEntry => ({ date, flow, updatedAt: 1 });

describe("period lengths", () => {
  it("counts each period's days with flow; spotting at the end does not add one", () => {
    const entries = [
      ...["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"].map((d) => day(d, "light")),
      day("2026-08-29", "heavy"),
      day("2026-08-30", "medium"),
      day("2026-08-31", "light"),
      day("2026-09-01", "spotting"),
    ];
    expect(periodLengths(entries)).toEqual([5, 3]);
  });

  it("leaves out a start with no flow logged, as onboarding gives", () => {
    expect(periodLengths([{ date: "2026-09-01", periodStart: true, updatedAt: 1 }])).toEqual([]);
  });
});
