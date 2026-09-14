import { describe, expect, it } from "vitest";
import type { Prediction } from "../cycle";
import { homeText } from "./text";

const TODAY = "2026-09-14";
const ready: Prediction = {
  status: "ready",
  cycleDay: 18,
  cycleLength: 29,
  next: { likely: "2026-09-26", earliest: "2026-09-25", latest: "2026-09-27" },
  setAside: [],
};
const next = (earliest: string, latest: string) => ({ ...ready, next: { likely: earliest, earliest, latest } });

describe("what home says", () => {
  it("gives a range, and how many days away it is", () => {
    expect(homeText(ready, TODAY)).toEqual({ primary: "Period likely between Sep 25 and Sep 27", secondary: "In 11–13 days", notes: [] });
  });

  it("counts down to one day, then says any day now", () => {
    expect(homeText(next("2026-09-19", "2026-09-19"), TODAY).secondary).toBe("In 5 days");
    expect(homeText(next("2026-09-15", "2026-09-15"), TODAY).secondary).toBe("It could start tomorrow");
    expect(homeText(next("2026-09-13", "2026-09-16"), TODAY).secondary).toBe("It could start any day now");
  });

  it("describes a late period gently", () => {
    expect(homeText({ ...ready, late: 1 }, TODAY).primary).toBe("Your period may be a day late");
    const late = homeText({ ...ready, late: 4 }, TODAY);
    expect(late.primary).toBe("Your period may be 4 days late");
    expect(late.secondary).toBe("Cycles vary, and a late period is common. Log it when it comes.");
  });

  it("says why a guess is rough", () => {
    expect(homeText({ ...ready, status: "learning", irregular: true, setAside: [95] }, TODAY).notes).toEqual([
      "Still learning your rhythm",
      "Your cycles vary, so this is a wider guess.",
      "Very short or very long cycles are left out of these guesses.",
    ]);
  });

  it("marks the fertile window, always as an estimate, and says nothing once it has passed", () => {
    const fertile = (start: string, end: string) => ({ ...ready, fertile: { start, end, ovulation: end } });
    expect(homeText(fertile("2026-09-12", "2026-09-18"), TODAY).notes).toEqual(["You're in your fertile window (estimate)"]);
    expect(homeText(fertile("2026-09-20", "2026-09-26"), TODAY).notes).toEqual(["Fertile window (estimate): Sep 20 – Sep 26"]);
    expect(homeText(fertile("2026-09-01", "2026-09-07"), TODAY).notes).toEqual([]);
  });

  it("explains an empty or paused home", () => {
    expect(homeText({ status: "none", setAside: [] }, TODAY).primary).toMatch(/When your period starts/);
    expect(homeText({ status: "paused", setAside: [] }, TODAY).primary).toMatch(/paused while pregnancy mode is on/);
  });
});
