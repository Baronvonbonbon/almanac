import { describe, expect, it } from "vitest";
import { memoryHost, MemoryStorage, type MemoryHost } from "../platform";
import { text } from "../lib/bytes";
import { PAD } from "./codec";
import { Vault, VaultError, type KdfParams } from ".";

// Cheap scrypt, so the suite stays fast. The real parameters live in the vault's meta record.
const FAST: KdfParams = { N: 2 ** 10, r: 8, p: 1 };

async function fresh(seed = "tester"): Promise<{ host: MemoryHost; vault: Vault }> {
  const host = memoryHost(seed);
  return { host, vault: await Vault.create(host, FAST) };
}

async function openNoPin(host: MemoryHost): Promise<Vault> {
  const r = await Vault.open(host);
  if (r.state !== "open") throw new Error(`expected open, got ${r.state}`);
  return r.vault;
}

const recordKeys = (storage: MemoryStorage, slot: 0 | 1) =>
  storage
    .keys()
    .filter((k) => k.startsWith(`a/v1/r/${slot}/`))
    .map((k) => k.slice(`a/v1/r/${slot}/`.length));

describe("vault", () => {
  it("starts with no vault, then opens without a PIN after the first launch", async () => {
    const host = memoryHost();
    expect(await Vault.open(host)).toEqual({ state: "new" });
    await Vault.create(host, FAST);
    const vault = await openNoPin(host);
    expect(vault.locked).toBe(false);
  });

  it("refuses to create a second vault over the first", async () => {
    const { host } = await fresh();
    await expect(Vault.create(host, FAST)).rejects.toMatchObject({ code: "exists" });
  });

  it("round-trips records, and a reopened vault reads them back", async () => {
    const { host, vault } = await fresh();
    await vault.writeJSON("m/2026-09", { "2026-09-11": { flow: "medium" } });
    expect(await vault.readJSON("m/2026-09")).toEqual({ "2026-09-11": { flow: "medium" } });
    expect(await (await openNoPin(host)).readJSON("m/2026-09")).toEqual({ "2026-09-11": { flow: "medium" } });
    expect(await vault.read("m/2026-08")).toBeNull();
  });

  it("stores ciphertext in steps of 1 KiB, with nothing readable in it", async () => {
    const { host, vault } = await fresh();
    await vault.writeJSON("m/2026-09", { note: "cramps and a headache" });
    for (const key of host.storage.keys().filter((k) => k.startsWith("a/v1/r/"))) {
      const bytes = (await host.storage.read(key))!;
      expect(bytes.length % PAD).toBe(0);
      expect(text(bytes)).not.toContain("cramps");
    }
    expect(host.storage.keys().join()).not.toContain("2026");
  });

  it("mirrors every record under both slots, at the same size", async () => {
    const { host, vault } = await fresh();
    await vault.writeJSON("m/2026-08", { a: 1 });
    await vault.writeJSON("m/2026-09", { note: "x".repeat(3000) });
    expect(recordKeys(host.storage, 0)).toEqual(recordKeys(host.storage, 1));
    const shape = host.storage.shape();
    for (const id of recordKeys(host.storage, 0)) expect(shape[`a/v1/r/0/${id}`]).toBe(shape[`a/v1/r/1/${id}`]);
  });

  it("cannot be opened by a different account on the same phone", async () => {
    const { host } = await fresh("alice");
    const other = memoryHost("bob", host.storage);
    expect(await Vault.open(other)).toEqual({ state: "locked" });
  });

  it("needs the PIN once one is set, and only the right one opens", async () => {
    const { host, vault } = await fresh();
    await vault.writeJSON("m/2026-09", { flow: "light" });
    await vault.setPin("482913");
    expect(await Vault.open(host)).toEqual({ state: "locked" });
    expect(await Vault.unlock(host, "000000")).toBeNull();
    const reopened = await Vault.unlock(host, "482913");
    expect(reopened?.locked).toBe(true);
    expect(await reopened!.readJSON("m/2026-09")).toEqual({ flow: "light" });
  });

  it("keeps the data when the PIN changes, and opens without one once it is removed", async () => {
    const { host, vault } = await fresh();
    await vault.writeJSON("m/2026-09", { flow: "heavy" });
    await vault.setPin("111111");
    await vault.setPin("222222");
    expect(await Vault.unlock(host, "111111")).toBeNull();
    const v = (await Vault.unlock(host, "222222"))!;
    await v.setPin(null);
    expect(await (await openNoPin(host)).readJSON("m/2026-09")).toEqual({ flow: "heavy" });
  });

  it("opens a separate, empty vault with the duress PIN", async () => {
    const { host, vault } = await fresh();
    await vault.writeJSON("m/2026-09", { flow: "medium" });
    await vault.setPin("482913");
    await vault.setDuressPin("135790");

    const decoy = (await Vault.unlock(host, "135790"))!;
    expect(await decoy.read("m/2026-09")).toBeNull(); // mirrored filler, not the real record
    await decoy.writeJSON("m/2026-09", { flow: "light" });

    expect(await (await Vault.unlock(host, "482913"))!.readJSON("m/2026-09")).toEqual({ flow: "medium" });
    expect(await (await Vault.unlock(host, "135790"))!.readJSON("m/2026-09")).toEqual({ flow: "light" });
  });

  it("needs a PIN before a duress PIN, and keeps the two different", async () => {
    const { vault } = await fresh();
    await expect(vault.setDuressPin("135790")).rejects.toMatchObject({ code: "pin-required" });
    await vault.setPin("482913");
    await expect(vault.setDuressPin("482913")).rejects.toMatchObject({ code: "pin-in-use" });
    await vault.setDuressPin("135790");
    await expect(vault.setPin("135790")).rejects.toMatchObject({ code: "pin-in-use" });
  });

  it("looks the same in storage with and without a duress PIN", async () => {
    const build = async (withDuress: boolean) => {
      const { host, vault } = await fresh("same-account");
      await vault.setPin("482913");
      if (withDuress) await vault.setDuressPin("135790");
      await vault.writeJSON("m/2026-08", { a: 1 });
      await vault.writeJSON("m/2026-09", { b: 2 });
      return host.storage.shape();
    };
    const without = await build(false);
    const withDuress = await build(true);
    expect(withDuress).toEqual(without);
  });

  it("destroys the real vault when a duress PIN set to erase is used", async () => {
    const { host, vault } = await fresh();
    await vault.writeJSON("m/2026-09", { flow: "medium" });
    await vault.setPin("482913");
    await vault.setDuressPin("135790", { eraseRealOnUse: true });
    expect(await Vault.unlock(host, "135790")).not.toBeNull();
    expect(await Vault.unlock(host, "482913")).toBeNull();
    expect(await Vault.unlock(host, "135790")).not.toBeNull();
  });

  it("removes any duress vault when the PIN is removed", async () => {
    const { host, vault } = await fresh();
    await vault.setPin("482913");
    await vault.setDuressPin("135790");
    await vault.setPin(null);
    expect(await Vault.unlock(host, "135790")).toBeNull();
    expect((await Vault.open(host)).state).toBe("open");
  });

  it("fails loudly when a record is copied onto another record's key", async () => {
    const { host, vault } = await fresh();
    await vault.writeJSON("m/2026-08", { a: 1 });
    const before = new Set(host.storage.keys());
    await vault.writeJSON("m/2026-09", { b: 2 });
    const added = host.storage.keys().filter((k) => !before.has(k) && k.startsWith("a/v1/r/"));
    const august = host.storage.keys().filter((k) => before.has(k) && k.startsWith("a/v1/r/"));
    // Overwrite every September record, in both slots, with August's bytes.
    for (const key of added) {
      const source = august.find((k) => k.slice(0, 9) === key.slice(0, 9))!;
      await host.storage.write(key, (await host.storage.read(source))!);
    }
    await expect(vault.read("m/2026-09")).rejects.toThrow();
  });

  it("keeps both slots the same size as a record grows and shrinks", async () => {
    const { host, vault } = await fresh();
    await vault.writeJSON("m/2026-09", { note: "x".repeat(3000) });
    await vault.writeJSON("m/2026-09", { note: "short" });
    expect(await vault.readJSON("m/2026-09")).toEqual({ note: "short" });
    const shape = host.storage.shape();
    const ids = recordKeys(host.storage, 0);
    for (const id of ids) expect(shape[`a/v1/r/0/${id}`]).toBe(shape[`a/v1/r/1/${id}`]);
    // Never shrinks: the short note still sits in a record the size of the long one.
    expect(Math.max(...ids.map((id) => shape[`a/v1/r/0/${id}`]))).toBeGreaterThanOrEqual(3 * PAD);
  });

  it("keeps both vaults' copies of a record readable, and the same size", async () => {
    const { host, vault } = await fresh();
    await vault.setPin("482913");
    await vault.setDuressPin("135790");
    const decoy = (await Vault.unlock(host, "135790"))!;
    await vault.writeJSON("m/2026-09", { flow: "medium" });
    await decoy.writeJSON("m/2026-09", { note: "y".repeat(5000) });
    await vault.writeJSON("m/2026-09", { flow: "heavy" });
    expect(await vault.readJSON("m/2026-09")).toEqual({ flow: "heavy" });
    expect(await decoy.readJSON("m/2026-09")).toEqual({ note: "y".repeat(5000) });
    const shape = host.storage.shape();
    for (const id of recordKeys(host.storage, 0)) expect(shape[`a/v1/r/0/${id}`]).toBe(shape[`a/v1/r/1/${id}`]);
  });

  it("leaves nothing behind after erase", async () => {
    const { host, vault } = await fresh();
    await vault.writeJSON("m/2026-09", { flow: "medium" });
    await vault.setPin("482913");
    await vault.setDuressPin("135790");
    await Vault.erase(host);
    expect(host.storage.keys()).toEqual([]);
    expect(await Vault.open(host)).toEqual({ state: "new" });
  });

  it("leaves nothing openable when erase is cut short after its first write", async () => {
    for (const pins of [[], ["482913", "135790"]]) {
      const { host, vault } = await fresh();
      await vault.writeJSON("m/2026-09", { flow: "medium" });
      if (pins.length) {
        await vault.setPin(pins[0]);
        await vault.setDuressPin(pins[1]);
      }
      // The phone dies, or storage fails, right after the wrapped keys are overwritten.
      host.storage.remove = () => Promise.reject(new Error("storage went away"));
      await expect(Vault.erase(host)).rejects.toThrow("storage went away");
      expect((await Vault.open(host)).state).toBe("locked");
      for (const pin of pins) expect(await Vault.unlock(host, pin)).toBeNull();
    }
  });

  it("reserves names starting with an underscore", async () => {
    const { vault } = await fresh();
    await expect(vault.write("_vault", new Uint8Array(1))).rejects.toBeInstanceOf(VaultError);
  });

  it("serialises concurrent writes", async () => {
    const { vault } = await fresh();
    await Promise.all(Array.from({ length: 12 }, (_, i) => vault.writeJSON(`m/2026-${String(i + 1).padStart(2, "0")}`, { i })));
    for (let i = 0; i < 12; i++) expect(await vault.readJSON(`m/2026-${String(i + 1).padStart(2, "0")}`)).toEqual({ i });
  });

  it("knows its own PIN, and not the duress PIN", async () => {
    const { vault } = await fresh();
    expect(await vault.isPin("482913")).toBe(false);
    await vault.setPin("482913");
    await vault.setDuressPin("135790");
    expect(await vault.isPin("482913")).toBe(true);
    expect(await vault.isPin("135790")).toBe(false);
  });

  it("removes the duress PIN and keeps the PIN", async () => {
    const { host, vault } = await fresh();
    await vault.setPin("482913");
    await vault.setDuressPin("135790");
    await vault.removeDuressPin();
    expect(await Vault.unlock(host, "135790")).toBeNull();
    expect(await Vault.unlock(host, "482913")).not.toBeNull();
  });

  it("starts the decoy with records of its own, which the real vault never sees", async () => {
    const { host, vault } = await fresh();
    await vault.writeJSON("settings", { from: "real" });
    await vault.setPin("482913");
    await vault.setDuressPin("135790", { records: { settings: { from: "decoy" }, "m/2026-08": { a: 1 } } });
    const decoy = (await Vault.unlock(host, "135790"))!;
    expect(await decoy.readJSON("settings")).toEqual({ from: "decoy" });
    expect(await decoy.list()).toEqual(["m/2026-08", "settings"]);
    expect(await vault.readJSON("settings")).toEqual({ from: "real" });
    expect(await vault.read("m/2026-08")).toBeNull();
  });

  it("can start with records, as a restored backup does", async () => {
    const host = memoryHost();
    const vault = await Vault.create(host, FAST, { settings: { a: 1 } });
    expect(await vault.list()).toEqual(["settings"]);
    expect(await (await openNoPin(host)).readJSON("settings")).toEqual({ a: 1 });
  });

  it("looks the same in storage with and without a PIN", async () => {
    const build = async (pin: boolean) => {
      const { host, vault } = await fresh("same-account");
      if (pin) await vault.setPin("482913");
      await vault.writeJSON("m/2026-09", { a: 1 });
      return host.storage.shape();
    };
    expect(await build(true)).toEqual(await build(false));
  });
});
