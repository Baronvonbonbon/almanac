import { describe, expect, it } from "vitest";
import { hex, utf8 } from "../lib/bytes";
import { memoryHost } from "../platform";
import { almanacPair, newKeyPair, newShare, pairingCode, readPairingCode } from "../share";
import { demoPairing } from "../share/testing";
import { Vault, type KdfParams } from "../vault";
import { shareKeys } from "./keys";
import { addShare, answerRequests, isLive, keptShares, openUntil, pruneShares, readOnlineOk, readShares, setOnlineOk, shareRecord, stopShare, type ShareChoice } from "./records";

const FAST: KdfParams = { N: 2 ** 10, r: 8, p: 1 };
const NOW = Date.UTC(2026, 8, 14, 9, 30);
const DAY = 24 * 3600_000;
const CHOICE: ShareChoice = { categories: ["periods", "symptoms"], from: "2026-03-14", to: "2026-09-14" };

async function made() {
  const host = memoryHost("sharing");
  const vault = await Vault.create(host, FAST);
  const provider = newKeyPair();
  const pairing = readPairingCode(pairingCode(demoPairing({ providerKey: provider.publicKey, firstOpeningKey: newKeyPair().publicKey, name: "Dr Okafor" })));
  const share = newShare(NOW + 7 * DAY, utf8("{}"));
  const record = shareRecord(share, pairing, CHOICE, NOW, NOW + 15 * 60_000);
  await addShare(vault, record);
  return { host, vault, share, pairing, record };
}

describe("keeping a copy online", () => {
  it("is off until someone agrees, and stays on once they have", async () => {
    const host = memoryHost("online");
    const vault = await Vault.create(host, FAST);
    // Nothing uploads while this is null: it is the only gate on it (docs/DESIGN.md §9).
    expect(await readOnlineOk(vault)).toBeNull();
    await setOnlineOk(vault, 1_700_000_000_000);
    expect(await readOnlineOk(vault)).toBe(1_700_000_000_000);
  });
});

describe("shares in the vault", () => {
  it("keep what almanac needs to answer the provider app, and nothing it doesn't", async () => {
    const { vault, share, pairing, record } = await made();
    const [kept] = await readShares(vault);
    expect(kept).toEqual(record);
    expect(kept.provider).toEqual({ name: "Dr Okafor", key: hex(pairing.providerKey), check: pairing.check });
    expect(isLive(kept, NOW)).toBe(true);
    // The keys come back as the formats use them: the same pair key, the same share key.
    const keys = shareKeys(kept);
    expect(hex(almanacPair(keys.sender, keys.providerKey).toProvider)).toBe(hex(almanacPair(share.sender, pairing.providerKey).toProvider));
    expect(hex(keys.shareKey!)).toBe(hex(share.shareKey));
    expect(JSON.stringify(kept)).not.toContain("payload");
  });

  it("forget the key that opens a share once it stops, so no opening can be allowed again", async () => {
    const { vault, record } = await made();
    await stopShare(vault, record.id, NOW + DAY);
    const [kept] = await readShares(vault);
    expect(kept.stopped).toBe(NOW + DAY);
    expect(kept.shareKey).toBeUndefined();
    expect(shareKeys(kept).shareKey).toBeUndefined();
    expect(isLive(kept, NOW + DAY)).toBe(false);
    // The share's own key stays until the end date, to seal the stop for the provider app.
    expect(kept.secret).toBe(record.secret);
  });

  it("note each opening allowed for the sharing history, and go altogether at the end date", async () => {
    const { vault, record } = await made();
    await answerRequests(vault, record.id, ["k0", "k1"], { at: NOW + 2 * DAY, until: NOW + 2 * DAY + 3600_000, key: "k1" });
    const [kept] = await readShares(vault);
    expect(kept.openings).toEqual([
      { at: NOW, until: NOW + 15 * 60_000 },
      { at: NOW + 2 * DAY, until: NOW + 2 * DAY + 3600_000, key: "k1" },
    ]);
    expect(kept.answered).toEqual(["k0", "k1"]);
    expect(isLive(kept, NOW + 7 * DAY)).toBe(false);
    await pruneShares(vault, NOW + 6 * DAY);
    expect(await readShares(vault)).toHaveLength(1);
    await pruneShares(vault, NOW + 7 * DAY);
    expect(await readShares(vault)).toEqual([]);
  });

  it("remember the last 32 requests answered, allowed or not, so none is asked about twice", async () => {
    const { vault, record } = await made();
    for (let i = 0; i < 40; i++) await answerRequests(vault, record.id, [`k${i}`]);
    const [kept] = await readShares(vault);
    expect(kept.answered).toHaveLength(32);
    expect([kept.answered![0], kept.answered!.at(-1)]).toEqual(["k8", "k39"]);
    // "Not now" allows nothing.
    expect(kept.openings).toHaveLength(1);
  });

  it("are forgotten as almanac reads them, once past their end date", async () => {
    const { vault, record } = await made();
    const later = shareRecord(newShare(NOW + 30 * DAY, utf8("{}")), readPairingCode(pairingCode(demoPairing({ providerKey: newKeyPair().publicKey, firstOpeningKey: newKeyPair().publicKey, name: "Riverside Midwives" }))), CHOICE, NOW, NOW + 3600_000);
    await addShare(vault, later);
    expect(await keptShares(vault, NOW + DAY)).toEqual([record, later]);
    expect(await keptShares(vault, NOW + 7 * DAY)).toEqual([later]);
    // Gone from the vault too, keys and all — not only from what was shown.
    expect(await readShares(vault)).toEqual([later]);
  });

  it("know while an opening is still open on the provider's screen — stopped or not", async () => {
    const { vault, record } = await made();
    expect(openUntil(record, NOW + 60_000)).toBe(NOW + 15 * 60_000);
    expect(openUntil(record, NOW + 15 * 60_000)).toBeNull();
    await stopShare(vault, record.id, NOW + 60_000);
    // The provider app already has the key for this opening: stopping can't take it back.
    expect(openUntil((await readShares(vault))[0], NOW + 2 * 60_000)).toBe(NOW + 15 * 60_000);
  });

  it("belong to the vault that made them: the decoy has none", async () => {
    const { host, vault } = await made();
    await vault.setPin("482913");
    await vault.setDuressPin("135790");
    const decoy = (await Vault.unlock(host, "135790"))!;
    expect(await readShares(decoy)).toEqual([]);
    expect(await readShares((await Vault.unlock(host, "482913"))!)).toHaveLength(1);
  });
});
