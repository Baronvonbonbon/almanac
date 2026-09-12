import { describe, expect, it } from "vitest";
import { predict, type DayEntry } from "../cycle";
import { memoryHost } from "../platform";
import { Vault } from "../vault";
import {
  allDays,
  DEFAULT_SETTINGS,
  isEmpty,
  loadSettings,
  migrate,
  NewerDataError,
  readMonth,
  runMigrations,
  saveDay,
  saveSettings,
  type Stored,
} from ".";

const vault = () => Vault.create(memoryHost("data"), { N: 2 ** 10, r: 8, p: 1 });
const day = (date: string, rest: Partial<DayEntry> = {}): DayEntry => ({ date, updatedAt: 1, ...rest });

describe("days", () => {
  it("saves a day into its month, and replaces it on the next save", async () => {
    const v = await vault();
    await saveDay(v, day("2026-09-11", { flow: "light" }));
    await saveDay(v, day("2026-09-11", { flow: "heavy", symptoms: ["cramps"] }));
    expect(await readMonth(v, "2026-09")).toEqual([day("2026-09-11", { flow: "heavy", symptoms: ["cramps"] })]);
    expect(await readMonth(v, "2026-08")).toEqual([]);
  });

  it("removes a day saved empty", async () => {
    const v = await vault();
    await saveDay(v, day("2026-09-11", { flow: "light" }));
    await saveDay(v, day("2026-09-11", { symptoms: [], note: "" }));
    expect(await readMonth(v, "2026-09")).toEqual([]);
  });

  it("counts an entry holding only its date as empty, but not a user's override", () => {
    expect(isEmpty(day("2026-09-11", { symptoms: [], note: "", fertility: {} }))).toBe(true);
    expect(isEmpty(day("2026-09-11", { periodStart: false }))).toBe(false);
  });

  it("reads every month back, in date order", async () => {
    const v = await vault();
    for (const date of ["2026-10-02", "2026-08-30", "2026-09-11"]) await saveDay(v, day(date, { flow: "medium" }));
    expect((await allDays(v)).map((e) => e.date)).toEqual(["2026-08-30", "2026-09-11", "2026-10-02"]);
  });

  it("loses nothing when days in one month are saved at once", async () => {
    const v = await vault();
    const dates = Array.from({ length: 10 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
    await Promise.all(dates.map((date) => saveDay(v, day(date, { flow: "light" }))));
    expect((await readMonth(v, "2026-09")).map((e) => e.date)).toEqual(dates);
  });

  it("rejects dates and months that do not exist", async () => {
    const v = await vault();
    await expect(saveDay(v, day("2026-02-30", { flow: "light" }))).rejects.toThrow(RangeError);
    await expect(readMonth(v, "2026-9")).rejects.toThrow(RangeError);
  });

  it("feeds predictions", async () => {
    const v = await vault();
    for (const start of ["2026-06-01", "2026-06-29", "2026-07-27", "2026-08-24"]) await saveDay(v, day(start, { flow: "heavy" }));
    expect(predict(await allDays(v), { today: "2026-09-01" })).toMatchObject({ status: "ready", cycleLength: 28 });
  });
});

describe("settings", () => {
  it("starts from the defaults, and round-trips", async () => {
    const v = await vault();
    expect(await loadSettings(v)).toEqual(DEFAULT_SETTINGS);
    await saveSettings(v, { ...DEFAULT_SETTINGS, typicalCycle: 31, modes: { ...DEFAULT_SETTINGS.modes, fertility: true } });
    expect(await loadSettings(v)).toMatchObject({ typicalCycle: 31, modes: { fertility: true, ttc: false } });
  });

  it("refuses data saved by a newer almanac, rather than overwrite it", () => {
    expect(() => migrate({ ...DEFAULT_SETTINGS, schema: 2 })).toThrow(NewerDataError);
  });

  it("runs each migration in turn, and stops where one is missing", () => {
    const steps = {
      1: (s: Stored) => ({ ...s, a: 1 }),
      2: (s: Stored) => ({ ...s, b: (s.a as number) + 1 }),
    };
    expect(runMigrations({ schema: 1 }, steps, 3)).toEqual({ schema: 3, a: 1, b: 2 });
    expect(() => runMigrations({ schema: 0 }, steps, 3)).toThrow(/no migration/);
  });
});
