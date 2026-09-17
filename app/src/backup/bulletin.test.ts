import { describe, expect, it } from "vitest";
import { memoryHost, MemoryBlobs, MemoryStatements } from "../platform";
import { Vault, type KdfParams } from "../vault";
import { backUpToBulletin, restoreFromBulletin } from "./bulletin";
import { newCode } from "./code";
import { BackupError, BUCKETS } from "./format";
import { bulletinDue, saveBackup, startBackup, type BackupRecord } from "./record";

const FAST: KdfParams = { N: 2 ** 10, r: 8, p: 1 };
const NOW = Date.UTC(2026, 8, 17, 9, 30);
const DAY = 86_400_000;
const LOGGED = { days: { "2026-09-01": { flow: "heavy" } } };

/** Bulletin and the statement store are the world; each phone is a host of its own inside it. */
function world() {
  return { store: new MemoryStatements(() => NOW), blobs: new MemoryBlobs() };
}

async function phone(w: ReturnType<typeof world>, name: string) {
  const host = memoryHost(name, undefined, w.store.port(name), w.blobs);
  return { host, vault: await Vault.create(host, FAST) };
}

/** A phone with a checked backup code and something logged. */
async function ready(w: ReturnType<typeof world>, name = "A") {
  const p = await phone(w, name);
  await p.vault.writeJSON("cycle", LOGGED);
  const record: BackupRecord = { ...(await startBackup(p.vault)), checked: true };
  await saveBackup(p.vault, record);
  return { ...p, record };
}

const problem = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
  } catch (e) {
    if (e instanceof BackupError) return e.kind;
    throw e;
  }
  return "no error";
};

describe("a backup on Bulletin", () => {
  it("is restored on another phone, with another account, by the backup code alone", async () => {
    const w = world();
    const a = await ready(w);
    const after = await backUpToBulletin(a.host, a.vault, a.record, NOW);
    expect(after.bulletin?.at).toBe(NOW);

    // A different phone: its own storage and its own account, sharing only Bulletin and the store.
    const b = memoryHost("B", undefined, w.store.port("B"), w.blobs);
    const restored = await restoreFromBulletin(b, a.record.code, { ms: 5, kdf: FAST });
    expect(await restored.vault.readJSON("cycle")).toEqual(LOGGED);
    expect(restored.at).toBe(NOW);
  });

  it("goes up at one of the padding sizes, so what it holds is not in its length", async () => {
    const w = world();
    const a = await ready(w);
    await backUpToBulletin(a.host, a.vault, a.record, NOW);
    expect(BUCKETS).toContain(w.blobs.sizes()[0]);
  });

  it("is not found by another code", async () => {
    const w = world();
    const a = await ready(w);
    await backUpToBulletin(a.host, a.vault, a.record, NOW);
    const b = memoryHost("B", undefined, w.store.port("B"), w.blobs);
    expect(await problem(() => restoreFromBulletin(b, newCode(), { ms: 5, kdf: FAST }))).toBe("not-found");
  });

  it("says the same thing when the backup has expired as when there never was one", async () => {
    const w = world();
    const a = await ready(w);
    await backUpToBulletin(a.host, a.vault, a.record, NOW);
    w.blobs.forget(); // Bulletin letting it go, about a fortnight on (P7)
    const b = memoryHost("B", undefined, w.store.port("B"), w.blobs);
    expect(await problem(() => restoreFromBulletin(b, a.record.code, { ms: 5, kdf: FAST }))).toBe("not-found");
  });

  it("takes the newest backup when more than one pointer is heard", async () => {
    const w = world();
    const a = await ready(w);
    await backUpToBulletin(a.host, a.vault, a.record, NOW - 6 * DAY);
    await a.vault.writeJSON("cycle", { days: { "2026-09-16": { flow: "light" } } });
    await backUpToBulletin(a.host, a.vault, a.record, NOW);

    const b = memoryHost("B", undefined, w.store.port("B"), w.blobs);
    const restored = await restoreFromBulletin(b, a.record.code, { ms: 5, kdf: FAST });
    expect(await restored.vault.readJSON("cycle")).toEqual({ days: { "2026-09-16": { flow: "light" } } });
    expect(restored.at).toBe(NOW);
  });

  it("refuses where there is nowhere to put one — the web tryout", async () => {
    const w = world();
    const a = await ready(w);
    const tryout = memoryHost("tryout"); // no statements, no blobs
    expect(await problem(() => backUpToBulletin(tryout, a.vault, a.record, NOW))).toBe("no-storage");
    expect(await problem(() => restoreFromBulletin(tryout, a.record.code, { ms: 5, kdf: FAST }))).toBe("no-storage");
  });

  it("leaves the previous backup pointed at when an upload fails", async () => {
    const w = world();
    const a = await ready(w);
    await backUpToBulletin(a.host, a.vault, a.record, NOW - 6 * DAY);

    // A host whose Bulletin refuses, as a spent quota would (B3).
    const broken = memoryHost("A2", undefined, w.store.port("A"), {
      put: () => Promise.reject(new Error("no quota left")),
      get: (h) => w.blobs.get(h),
    });
    expect(await problem(() => backUpToBulletin(broken, a.vault, a.record, NOW))).toBe("refused");

    // The pointer from six days ago still stands, and still restores.
    const b = memoryHost("B", undefined, w.store.port("B"), w.blobs);
    const restored = await restoreFromBulletin(b, a.record.code, { ms: 5, kdf: FAST });
    expect(restored.at).toBe(NOW - 6 * DAY);
    expect(await restored.vault.readJSON("cycle")).toEqual(LOGGED);
  });
});

describe("when a backup is due", () => {
  const record = (over: Partial<BackupRecord> = {}): BackupRecord => ({ code: newCode(), checked: true, bulletinOk: NOW - 30 * DAY, ...over });

  it("waits until the code has been written down and checked", () => {
    expect(bulletinDue(record({ checked: false }), NOW)).toBe(false);
    expect(bulletinDue(null, NOW)).toBe(false);
    expect(bulletinDue(record(), NOW)).toBe(true);
  });

  it("waits until someone has agreed to it, however overdue it is", () => {
    // R7: the schedule must never be what first puts a copy on a public network.
    expect(bulletinDue(record({ bulletinOk: undefined }), NOW)).toBe(false);
    expect(bulletinDue(record({ bulletinOk: undefined, bulletin: { at: NOW - 400 * DAY, hash: "" } }), NOW)).toBe(false);
  });

  it("is every five days, not every log", () => {
    expect(bulletinDue(record({ bulletin: { at: NOW - 4 * DAY, hash: "" } }), NOW)).toBe(false);
    expect(bulletinDue(record({ bulletin: { at: NOW - 5 * DAY, hash: "" } }), NOW)).toBe(true);
  });
});
