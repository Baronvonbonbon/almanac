import { describe, expect, it } from "vitest";
import { backupAsText, startBackup } from "../backup/record";
import { text } from "../lib/bytes";
import { memoryHost, type MemoryHost } from "../platform";
import { Vault, writeLook, wrongPin, type KdfParams } from ".";

// What a copy of almanac's storage shows: someone with the raw bytes off the phone, or another
// Product that could somehow read them. Cheap scrypt, so the suite stays fast.
const FAST: KdfParams = { N: 2 ** 10, r: 8, p: 1 };
const PIN = "482913";
const DURESS = "135790";
const META = "a/v1/meta";

// Everything someone might search a copy for: what was logged, the record names, the modes, the
// look, both PINs.
const SECRETS = ["felt sick this morning", "positive test", "cramps", "heavy", "2026-09", "2026-08", "settings", "backup", "protection", "pregnancy", "moonpaper", PIN, DURESS];

/** A store that has been lived in: a look, settings, a month, a backup code, a PIN, a decoy with a month of its own, a wrong PIN. */
async function livedIn(): Promise<{ host: MemoryHost; vault: Vault; code: string }> {
  const host = memoryHost("at-rest");
  await writeLook(host, "moonpaper");
  const vault = await Vault.create(host, FAST);
  await vault.writeJSON("settings", { schema: 1, modes: { fertility: true, ttc: true, pregnancy: true }, typicalCycle: 29 });
  await vault.writeJSON("m/2026-09", { "2026-09-11": { flow: "heavy", symptoms: ["cramps"], note: "felt sick this morning", fertility: { lhTest: "positive" } } });
  const { code } = await startBackup(vault);
  await vault.setPin(PIN);
  await vault.setDuressPin(DURESS);
  await vault.writeJSON("protection", { duress: true });
  const decoy = await Vault.unlock(host, DURESS);
  await decoy!.writeJSON("m/2026-08", { "2026-08-02": { note: "positive test" } });
  await wrongPin(host);
  return { host, vault, code };
}

const forms = (code: string) => [code, code.match(/.{4}/g)!.join(" "), code.toLowerCase()];

describe("at rest", () => {
  it("a copy of the store shows nothing that was logged, named, chosen or typed", async () => {
    const { host, code } = await livedIn();
    const keys = host.storage.keys();
    expect(keys.length).toBeGreaterThan(8);
    for (const key of keys) {
      for (const secret of [...SECRETS, ...forms(code)]) expect(key).not.toContain(secret);
      const bytes = (await host.storage.read(key))!;
      for (const secret of [...SECRETS, ...forms(code)]) expect(text(bytes), `${key} holds "${secret}"`).not.toContain(secret);
    }
  });

  it("keeps one record readable as it is: the format record, which holds no data", async () => {
    const { host } = await livedIn();
    for (const key of host.storage.keys()) {
      const bytes = (await host.storage.read(key))!;
      if (key === META) expect(JSON.parse(text(bytes))).toMatchObject({ v: 1 });
      else expect(() => JSON.parse(text(bytes)), key).toThrow();
    }
  });

  it("the copied backup shows only its heading, and nothing of the backup code", async () => {
    const { vault, code } = await livedIn();
    const record = await startBackup(vault);
    const copied = await backupAsText(vault, record, "HEADING");
    expect(copied.startsWith("HEADING\nalmanac1:")).toBe(true);
    const body = copied.slice("HEADING\n".length);
    for (const secret of [...SECRETS, ...forms(code)]) expect(body).not.toContain(secret);
  });
});
