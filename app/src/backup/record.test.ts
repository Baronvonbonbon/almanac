import { describe, expect, it } from "vitest";
import { memoryHost } from "../platform";
import { Vault } from "../vault";
import { parseCode } from "./code";
import { openBackup, readBackupText } from "./format";
import { backupAsText, isStale, readBackup, startBackup } from "./record";

const FAST = { N: 2 ** 10, r: 8, p: 1 };

describe("the backup record", () => {
  it("makes the code once, and keeps it", async () => {
    const vault = await Vault.create(memoryHost(), FAST);
    const first = await startBackup(vault);
    expect(first.checked).toBe(false);
    expect(await startBackup(vault)).toEqual(first);
    expect(await readBackup(vault)).toEqual(first);
  });

  it("copies a backup that opens with the kept code, and holds the code itself, marked as copied", async () => {
    const vault = await Vault.create(memoryHost(), FAST);
    await vault.writeJSON("m/2026-09", { "2026-09-01": { date: "2026-09-01", flow: "light", updatedAt: 1 } });
    const record = await startBackup(vault);
    const text = await backupAsText(vault, record, "heading", 42);
    const code = parseCode(record.code);
    if (!("entropy" in code)) throw new Error(code.problem);
    expect(openBackup(code.entropy, readBackupText(text))).toMatchObject({
      records: { backup: { ...record, copiedAt: 42 }, "m/2026-09": { "2026-09-01": { flow: "light" } } },
    });
  });

  it("falls behind once something is logged after the copy", () => {
    const record = { code: "x", checked: true, copiedAt: 100 };
    expect(isStale(record, [{ date: "2026-09-01", updatedAt: 50 }])).toBe(false);
    expect(isStale(record, [{ date: "2026-09-02", updatedAt: 150 }])).toBe(true);
    expect(isStale({ code: "x", checked: true }, [{ date: "2026-09-02", updatedAt: 150 }])).toBe(false);
  });
});
