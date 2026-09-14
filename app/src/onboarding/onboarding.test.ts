import { describe, expect, it } from "vitest";
import { predict } from "../cycle";
import { allDays, loadSettings } from "../data";
import { memoryHost } from "../platform";
import { Vault, type KdfParams } from "../vault";
import { finishOnboarding } from "./finish";

const FAST: KdfParams = { N: 2 ** 10, r: 8, p: 1 };

describe("finishing onboarding", () => {
  it("stores the answers, and predictions start from them", async () => {
    const host = memoryHost();
    const vault = await finishOnboarding(host, { lastPeriod: "2026-09-01", typicalCycle: 30, fertility: true, ttc: false }, { kdf: FAST, now: 1 });
    const settings = await loadSettings(vault);
    expect(settings.typicalCycle).toBe(30);
    expect(settings.modes).toEqual({ fertility: true, ttc: false, pregnancy: false });
    const days = await allDays(vault);
    expect(days).toEqual([{ date: "2026-09-01", periodStart: true, updatedAt: 1 }]);
    expect(predict(days, { today: "2026-09-14", typicalCycle: 30 })).toMatchObject({ status: "learning", cycleDay: 14, cycleLength: 30 });
  });

  it("stores nothing for an answer left as not sure", async () => {
    const vault = await finishOnboarding(memoryHost(), { lastPeriod: null, typicalCycle: null, fertility: false, ttc: false }, { kdf: FAST });
    expect((await loadSettings(vault)).typicalCycle).toBeUndefined();
    expect(await allDays(vault)).toEqual([]);
  });

  it("leaves a vault that opens without a PIN next time", async () => {
    const host = memoryHost();
    await finishOnboarding(host, { lastPeriod: null, typicalCycle: 28, fertility: false, ttc: true }, { kdf: FAST });
    const opened = await Vault.open(host);
    expect(opened.state).toBe("open");
    if (opened.state === "open") expect((await loadSettings(opened.vault)).modes.ttc).toBe(true);
  });

  it("stores nothing until the last step", async () => {
    const host = memoryHost();
    expect(host.storage.keys()).toEqual([]);
    expect((await Vault.open(host)).state).toBe("new");
  });
});
