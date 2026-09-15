import { describe, expect, it } from "vitest";
import { hex, utf8 } from "../lib/bytes";
import { memoryHost } from "../platform";
import { almanacPair, newKeyPair, newShare, pairingCode, readPairingCode } from "../share";
import { Vault, type KdfParams } from "../vault";
import { addShare, isLive, pruneShares, readShares, recordOpening, shareKeys, shareRecord, stopShare, type ShareChoice } from "./records";

const FAST: KdfParams = { N: 2 ** 10, r: 8, p: 1 };
const NOW = Date.UTC(2026, 8, 14, 9, 30);
const DAY = 24 * 3600_000;
const CHOICE: ShareChoice = { categories: ["periods", "symptoms"], from: "2026-03-14", to: "2026-09-14" };

async function made() {
  const host = memoryHost("sharing");
  const vault = await Vault.create(host, FAST);
  const provider = newKeyPair();
  const pairing = readPairingCode(pairingCode({ providerKey: provider.publicKey, firstOpeningKey: newKeyPair().publicKey, name: "Dr Okafor" }));
  const share = newShare(NOW + 7 * DAY, utf8("{}"));
  const record = shareRecord(share, pairing, CHOICE, NOW, NOW + 15 * 60_000);
  await addShare(vault, record);
  return { host, vault, share, pairing, record };
}

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

  it("note each opening for the sharing history, and go altogether at the end date", async () => {
    const { vault, record } = await made();
    await recordOpening(vault, record.id, NOW + 2 * DAY, NOW + 2 * DAY + 3600_000);
    expect((await readShares(vault))[0].openings).toEqual([
      { at: NOW, until: NOW + 15 * 60_000 },
      { at: NOW + 2 * DAY, until: NOW + 2 * DAY + 3600_000 },
    ]);
    expect(isLive((await readShares(vault))[0], NOW + 7 * DAY)).toBe(false);
    await pruneShares(vault, NOW + 6 * DAY);
    expect(await readShares(vault)).toHaveLength(1);
    await pruneShares(vault, NOW + 7 * DAY);
    expect(await readShares(vault)).toEqual([]);
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
