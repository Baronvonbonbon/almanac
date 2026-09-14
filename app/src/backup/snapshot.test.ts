import { describe, expect, it } from "vitest";
import { allDays, DEFAULT_SETTINGS, loadSettings, saveDay, saveSettings } from "../data";
import { memoryHost } from "../platform";
import { Vault, type KdfParams } from "../vault";
import { newCode, parseCode } from "./code";
import { BackupError, backupText, openBackup, readBackupText, sealBackup } from "./format";
import { restoreSnapshot, takeSnapshot } from "./snapshot";

const FAST: KdfParams = { N: 2 ** 10, r: 8, p: 1 };

describe("backing up and restoring", () => {
  it("carries everything to another phone and another account, and leaves the PIN behind", async () => {
    const host = memoryHost("alice");
    const vault = await Vault.create(host, FAST);
    await saveSettings(vault, { ...DEFAULT_SETTINGS, typicalCycle: 30 });
    await saveDay(vault, { date: "2026-09-01", flow: "heavy", symptoms: ["cramps"], updatedAt: 1 });
    await vault.writeJSON("protection", { duress: true });
    await vault.setPin("482913");

    const code = newCode();
    const r = parseCode(code);
    if (!("entropy" in r)) throw new Error(r.problem);
    const copied = backupText(sealBackup(r.entropy, await takeSnapshot(vault, 5)), "almanac backup");

    const phone = memoryHost("bob");
    const restored = await restoreSnapshot(phone, openBackup(r.entropy, readBackupText(copied)), FAST);
    expect(await loadSettings(restored)).toMatchObject({ typicalCycle: 30 });
    expect(await allDays(restored)).toEqual([{ date: "2026-09-01", flow: "heavy", symptoms: ["cramps"], updatedAt: 1 }]);
    expect(await restored.read("protection")).toBeNull();
    expect(restored.locked).toBe(false);
    expect((await Vault.open(phone)).state).toBe("open");
  });

  it("refuses anything that is not a snapshot, or one from a newer almanac, and leaves no vault", async () => {
    const phone = memoryHost();
    await expect(restoreSnapshot(phone, { hello: 1 }, FAST)).rejects.toBeInstanceOf(BackupError);
    await expect(restoreSnapshot(phone, { v: 2, created: 1, records: {} }, FAST)).rejects.toMatchObject({ kind: "newer" });
    expect((await Vault.open(phone)).state).toBe("new");
  });
});
