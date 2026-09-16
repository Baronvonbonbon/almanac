import { describe, expect, it } from "vitest";
import type { DayEntry } from "../cycle";
import { DEFAULT_SETTINGS, type Settings } from "../data";
import { decodeSelection, encodeSelection, newKeyPair, newShare, pairingCode, readPairingCode, sealShare } from "../share";
import { demoPairing } from "../share/testing";
import { defaultChoice, offeredCategories, selectForShare } from "./select";

const TODAY = "2026-09-14";
const day = (date: string, e: Omit<DayEntry, "date" | "updatedAt">): DayEntry => ({ date, updatedAt: 1, ...e });

// Three periods, and a day with something in every category.
const ENTRIES: DayEntry[] = [
  day("2026-06-20", { flow: "medium" }),
  day("2026-06-21", { flow: "light" }),
  day("2026-07-18", { flow: "heavy", symptoms: ["cramps"] }),
  day("2026-07-19", { flow: "medium" }),
  day("2026-07-20", { flow: "light" }),
  day("2026-08-02", {
    symptoms: ["headache"],
    mood: ["anxious"],
    energy: 2,
    note: "saw the midwife",
    fertility: { lhTest: "positive", temperatureC: 36.7 },
    intimacy: { protected: false },
  }),
  day("2026-08-15", { flow: "medium" }),
  day("2026-08-16", { flow: "medium" }),
  day("2026-08-17", { flow: "spotting" }),
];

const everything: Settings = { ...DEFAULT_SETTINGS, modes: { fertility: true, ttc: true, pregnancy: false }, typicalCycle: 28, typicalPeriod: 4 };

describe("what a share holds", () => {
  it("starts with periods and symptoms only, over six months — nothing more personal, whatever was logged", () => {
    const choice = defaultChoice(TODAY);
    expect(choice).toEqual({ categories: ["periods", "symptoms"], from: "2026-03-16", to: TODAY });
    const s = selectForShare(ENTRIES, everything, choice, TODAY);
    const json = JSON.stringify(s);
    for (const personal of ["anxious", "energy", "midwife", "lhTest", "temperature", "intimacy", "protected", "fertile", "pregnancy"]) expect(json).not.toContain(personal);
    expect(s.days["2026-08-02"]).toEqual({ symptoms: ["headache"] });
    expect(s.days["2026-07-18"]).toEqual({ flow: "heavy", symptoms: ["cramps"] });
  });

  it("adds each category's own fields, and only those", () => {
    const only = (categories: ReturnType<typeof defaultChoice>["categories"]) =>
      selectForShare(ENTRIES, everything, { ...defaultChoice(TODAY), categories }, TODAY).days["2026-08-02"];
    expect(only(["mood"])).toEqual({ mood: ["anxious"], energy: 2 });
    expect(only(["notes"])).toEqual({ note: "saw the midwife" });
    expect(only(["ttc"])).toEqual({ fertility: { lhTest: "positive", temperatureC: 36.7 } });
    // Sex is a category of its own: trying to conceive does not bring it along.
    expect(only(["intimacy"])).toEqual({ intimacy: { protected: false } });
    expect(only(["periods"])).toBeUndefined();
  });

  it("gives each period in the range its length, and a cycle's length only when the next began in the range too", () => {
    const s = selectForShare(ENTRIES, everything, { ...defaultChoice(TODAY), from: "2026-07-01" }, TODAY);
    expect(s.cycles).toEqual([
      { start: "2026-07-18", period: 3, length: 28 },
      { start: "2026-08-15", period: 2 },
    ]);
    expect(s.usual).toEqual({ cycle: 28, period: 4 });
    expect(Object.keys(s.days)).not.toContain("2026-06-20");
  });

  it("says nothing of what came after the range, and does not take a period under way at its start for a new one", () => {
    const s = selectForShare(ENTRIES, everything, { categories: ["periods"], from: "2026-06-21", to: "2026-08-15" }, TODAY);
    expect(s.cycles).toEqual([
      { start: "2026-07-18", period: 3, length: 28 },
      { start: "2026-08-15", period: 1 },
    ]);
    expect(s.days["2026-06-21"]).toEqual({ flow: "light" });
    expect(Object.keys(s.days)).not.toContain("2026-08-16");
  });

  it("carries the fertile-window estimate and the pregnancy date only when chosen, and only with the mode on", () => {
    const all = { ...defaultChoice(TODAY), categories: ["periods", "fertileWindow", "pregnancy"] as const };
    const withFertile = selectForShare(ENTRIES, everything, { ...all, categories: [...all.categories] }, TODAY);
    expect(withFertile.fertile).toBeDefined();
    expect(withFertile.pregnancy).toBeUndefined();
    const pregnant = { ...everything, modes: { fertility: false, ttc: false, pregnancy: true } };
    expect(selectForShare(ENTRIES, pregnant, { ...all, categories: [...all.categories] }, TODAY).pregnancy).toEqual({ since: "2026-08-15" });
    expect(selectForShare(ENTRIES, { ...everything, modes: { ...everything.modes, fertility: false } }, { ...all, categories: [...all.categories] }, TODAY).fertile).toBeUndefined();
  });

  it("offers what was logged in the days chosen, even with its mode off now — and almanac's own reckoning only with its mode on", () => {
    const sixMonths = { from: "2026-03-16", to: TODAY };
    const always = ["periods", "symptoms", "mood", "notes"];
    expect(offeredCategories([], DEFAULT_SETTINGS, sixMonths)).toEqual(always);
    // Trying-to-conceive details and sex were logged on Aug 2; the mode is off now.
    expect(offeredCategories(ENTRIES, DEFAULT_SETTINGS, sixMonths)).toEqual([...always, "ttc", "intimacy"]);
    expect(offeredCategories(ENTRIES, DEFAULT_SETTINGS, { from: "2026-08-03", to: TODAY })).toEqual(always);
    const sexOnly = [day("2026-09-01", { intimacy: {} })];
    expect(offeredCategories(sexOnly, DEFAULT_SETTINGS, sixMonths)).toEqual([...always, "intimacy"]);
    // With a mode on, its categories are offered whatever was logged.
    expect(offeredCategories([], everything, sixMonths)).toEqual([...always, "fertileWindow", "ttc", "intimacy"]);
    expect(offeredCategories(ENTRIES, { ...DEFAULT_SETTINGS, modes: { fertility: false, ttc: false, pregnancy: true } }, sixMonths)).toEqual([...always, "ttc", "intimacy", "pregnancy"]);
  });

  it("goes into a share and comes back out whole", async () => {
    const s = selectForShare(ENTRIES, everything, { ...defaultChoice(TODAY), categories: ["periods", "symptoms", "mood", "notes"] }, TODAY);
    const pairing = readPairingCode(pairingCode(demoPairing({ providerKey: newKeyPair().publicKey, firstOpeningKey: newKeyPair().publicKey, name: "Dr Okafor" })));
    const packed = await encodeSelection(s);
    expect(sealShare(newShare(Date.UTC(2026, 8, 21), packed), pairing, Date.UTC(2026, 8, 14, 10)).length).toBe(2048);
    expect(await decodeSelection(packed)).toEqual(s);
  });
});
