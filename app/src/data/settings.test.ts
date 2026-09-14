import { describe, expect, it } from "vitest";
import { memoryHost } from "../platform";
import { Vault } from "../vault";
import { DEFAULT_SETTINGS, loadSettings, updateSettings, withLength } from ".";

const vault = () => Vault.create(memoryHost("settings"), { N: 2 ** 10, r: 8, p: 1 });

describe("changing settings", () => {
  it("keeps every change made in quick succession", async () => {
    const v = await vault();
    await Promise.all([
      updateSettings(v, (s) => ({ ...s, modes: { ...s.modes, fertility: true } })),
      updateSettings(v, (s) => withLength(s, "typicalCycle", 31)),
      updateSettings(v, (s) => ({ ...s, modes: { ...s.modes, pregnancy: true } })),
    ]);
    expect(await loadSettings(v)).toEqual({ ...DEFAULT_SETTINGS, modes: { fertility: true, ttc: false, pregnancy: true }, typicalCycle: 31 });
  });

  it("forgets a length set back to not sure", async () => {
    const v = await vault();
    await updateSettings(v, (s) => withLength(s, "typicalPeriod", 4));
    expect((await loadSettings(v)).typicalPeriod).toBe(4);
    await updateSettings(v, (s) => withLength(s, "typicalPeriod", undefined));
    expect(await loadSettings(v)).toEqual(DEFAULT_SETTINGS);
  });
});
