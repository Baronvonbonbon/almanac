import { describe, expect, it } from "vitest";
import { isEmpty } from "../data";
import { celsius, entryOf, formOf, inUnit, plausible, summary } from "./entry";

const DATE = "2026-09-14";

describe("the log sheet's entries", () => {
  it("starts blank for a day with nothing logged", () => {
    expect(formOf()).toEqual({ flow: null, symptoms: [], mood: [], note: "", lhTest: null, temperatureC: null, fluid: null, intimacy: "none" });
  });

  it("replaces what the sheet edits, and keeps what it does not", () => {
    const existing = { date: DATE, periodStart: true, energy: 3 as const, flow: "heavy" as const, symptoms: ["cramps"], updatedAt: 1 };
    const form = { ...formOf(existing), flow: "light" as const, symptoms: ["headache"], note: "  walked  " };
    expect(entryOf(DATE, form, existing, 2, false)).toEqual({ date: DATE, periodStart: true, energy: 3, flow: "light", symptoms: ["headache"], note: "walked", updatedAt: 2 });
  });

  it("gives an empty entry when everything is cleared, so saving removes the day", () => {
    const existing = { date: DATE, flow: "light" as const, mood: ["calm"], updatedAt: 1 };
    expect(isEmpty(entryOf(DATE, formOf(), existing, 2, false))).toBe(true);
  });

  it("hides trying-to-conceive details while that mode is off, without erasing them", () => {
    const existing = { date: DATE, fertility: { lhTest: "positive" as const }, intimacy: { protected: false }, updatedAt: 1 };
    const saved = entryOf(DATE, formOf(), existing, 2, false);
    expect(saved.fertility).toEqual({ lhTest: "positive" });
    expect(saved.intimacy).toEqual({ protected: false });
  });

  it("writes and clears trying-to-conceive details while that mode is on", () => {
    const form = { ...formOf(), lhTest: "positive" as const, temperatureC: 36.55, fluid: "eggwhite" as const, intimacy: "protected" as const };
    const saved = entryOf(DATE, form, undefined, 2, true);
    expect(saved).toMatchObject({ fertility: { lhTest: "positive", temperatureC: 36.55, fluid: "eggwhite" }, intimacy: { protected: true } });
    expect(formOf(saved)).toEqual(form);
    const cleared = entryOf(DATE, formOf(), saved, 3, true);
    expect(cleared.fertility).toBeUndefined();
    expect(cleared.intimacy).toBeUndefined();
  });

  it("converts temperatures, and refuses ones that cannot be body temperatures", () => {
    expect(celsius(98.6, "F")).toBe(37);
    expect(inUnit(36.5, "F")).toBe(97.7);
    expect(inUnit(36.5, "C")).toBe(36.5);
    expect(plausible(celsius(97.7, "F"))).toBe(true);
    expect(plausible(celsius(977, "F"))).toBe(false);
    expect(plausible(Number.NaN)).toBe(false);
  });

  it("sums a day up in a few words, keeping sensitive details vague", () => {
    expect(summary({ date: DATE, flow: "light", symptoms: ["cramps"], mood: ["calm"], updatedAt: 1 })).toBe("Light flow · Cramps · Calm");
    expect(summary({ date: DATE, intimacy: { protected: true }, updatedAt: 1 })).toBe("More details");
    expect(summary({ date: DATE, flow: "spotting", symptoms: ["cramps", "acne", "nausea"], note: "x", updatedAt: 1 })).toBe("Spotting · Cramps · Acne · 2 more");
  });
});
