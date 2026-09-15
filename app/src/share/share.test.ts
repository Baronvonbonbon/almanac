import { describe, expect, it } from "vitest";
import { fromBase32, toBase32 } from "../lib/base32";
import { fromHex, hex, text, utf8 } from "../lib/bytes";
import { ShareError, type ShareProblem } from "./errors";
import { almanacPair, checkDigits, keyPairFrom, newKeyPair, providerPair } from "./keys";
import { ENTRY_BYTES, openEntry, openRequest, REQUEST_BYTES, sealApproval, sealRequest, sealStop, unmaskShareKey } from "./messages";
import { PAIRING_PREFIX, pairingCode, readPairingCode } from "./pairing";
import { MAX_PAYLOAD, newShare, openStored, readShare, sealShare, SHARE_BUCKETS } from "./share";
import vectors from "./vectors.json";

const NOW = Date.UTC(2026, 8, 14, 9, 30);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const PAYLOAD = utf8(JSON.stringify({ from: "2026-03-01", to: "2026-09-14", note: "sharp pain on the left side" }));

function problem(fn: () => unknown): ShareProblem | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof ShareError) return e.problem;
    throw e;
  }
  return null;
}

/** A provider app shows its code; almanac scans it and makes a share, open for 15 minutes. */
function visit(payload: Uint8Array = PAYLOAD) {
  const provider = newKeyPair();
  const first = newKeyPair();
  const pairing = readPairingCode(pairingCode({ providerKey: provider.publicKey, firstOpeningKey: first.publicKey, name: "Dr Okafor" }));
  const share = newShare(NOW + 7 * DAY, payload);
  return { provider, first, pairing, share, bytes: sealShare(share, pairing, NOW + 15 * MINUTE) };
}

describe("a provider's code", () => {
  it("carries both keys and the name, in the characters a QR code packs most tightly, with six digits to compare", () => {
    const provider = newKeyPair();
    const first = newKeyPair();
    const code = pairingCode({ providerKey: provider.publicKey, firstOpeningKey: first.publicKey, name: "Dr Okafor, Riverside Clinic" });
    expect(code.startsWith(PAIRING_PREFIX)).toBe(true);
    expect(code).toMatch(/^[0-9A-Z $%*+\-./:]+$/);
    expect(code.length).toBeLessThan(200);
    const read = readPairingCode(code);
    expect(hex(read.providerKey)).toBe(hex(provider.publicKey));
    expect(hex(read.firstOpeningKey)).toBe(hex(first.publicKey));
    expect(read.name).toBe("Dr Okafor, Riverside Clinic");
    expect(read.check).toMatch(/^\d{6}$/);
    expect(read.check).toBe(checkDigits(provider.publicKey));
  });

  it("shows other digits when it has been swapped for another", () => {
    const a = keyPairFrom(new Uint8Array(32).fill(1)).publicKey;
    const b = keyPairFrom(new Uint8Array(32).fill(2)).publicKey;
    expect(checkDigits(a)).not.toBe(checkDigits(b));
  });

  it("refuses anything that isn't a provider's code, one from a newer provider app, and names that could mislead", () => {
    expect(problem(() => readPairingCode("https://example.com"))).toBe("format");
    expect(problem(() => readPairingCode(`${PAIRING_PREFIX}NOT-BASE32`))).toBe("format");
    const keys = { providerKey: newKeyPair().publicKey, firstOpeningKey: newKeyPair().publicKey };
    const bytes = fromBase32(pairingCode({ ...keys, name: "Dr Okafor" }).slice(PAIRING_PREFIX.length));
    bytes[0] = 2;
    expect(problem(() => readPairingCode(PAIRING_PREFIX + toBase32(bytes)))).toBe("newer");
    // A right-to-left override: the name would read differently on screen from what it is.
    expect(problem(() => pairingCode({ ...keys, name: "Dr ‮rofako" }))).toBe("format");
    expect(problem(() => pairingCode({ ...keys, name: "x".repeat(41) }))).toBe("format");
    expect(problem(() => pairingCode({ ...keys, name: "   " }))).toBe("format");
  });
});

describe("a share", () => {
  it("opens at the visit for the provider app whose code was scanned, until the time chosen", () => {
    const { provider, first, bytes, share } = visit();
    const read = readShare(bytes, provider);
    expect(hex(read.header.id)).toBe(hex(share.id));
    expect(read.header.ends).toBe(NOW + 7 * DAY);
    expect(read.firstApproval.until).toBe(NOW + 15 * MINUTE);
    const key = unmaskShareKey(read.firstApproval, first, read.header.senderKey);
    expect(hex(openStored(read.stored, key).payload)).toBe(hex(PAYLOAD));
  });

  it("opens a share sealed by v1", () => {
    const s = vectors.sealed;
    const read = readShare(fromHex(s.share), keyPairFrom(fromHex(vectors.keys.providerSecret)));
    expect(hex(read.header.id)).toBe(s.id);
    expect(read.header.ends).toBe(s.ends);
    expect(read.firstApproval.until).toBe(s.until);
    const key = unmaskShareKey(read.firstApproval, keyPairFrom(fromHex(vectors.keys.openingSecret)), read.header.senderKey);
    expect(hex(key)).toBe(s.shareKey);
    expect(JSON.parse(text(openStored(read.stored, key).payload))).toEqual(s.selection);
  });

  it("is always 2, 4, 8 or 16 KiB, and shows nothing of what it holds, nor its key", () => {
    const sizes = new Set<number>();
    for (const length of [20, 3000, MAX_PAYLOAD]) {
      const payload = utf8(`sharp pain ${"x".repeat(length - 11)}`);
      const { bytes, share } = visit(payload);
      expect(SHARE_BUCKETS).toContain(bytes.length);
      sizes.add(bytes.length);
      expect(new TextDecoder().decode(bytes)).not.toContain("sharp pain");
      expect(hex(bytes)).not.toContain(hex(share.shareKey));
    }
    expect([...sizes]).toEqual([2048, 4096, 16384]);
    expect(problem(() => visit(new Uint8Array(MAX_PAYLOAD + 1)))).toBe("too-large");
  });

  it("cannot be read by another provider app, nor opened without the opening key's secret half", () => {
    const { bytes, provider } = visit();
    expect(problem(() => readShare(bytes, newKeyPair()))).toBe("not-for-you");
    const read = readShare(bytes, provider);
    // The provider app's pairing key is not the opening key: keeping it opens nothing.
    expect(problem(() => unmaskShareKey(read.firstApproval, provider, read.header.senderKey))).toBe("not-for-you");
    expect(problem(() => openStored(read.stored, new Uint8Array(32)))).toBe("not-for-you");
  });

  it("is kept without its first approval, and opens again only with a new approval, for a new key", () => {
    const { bytes, provider, first, share, pairing } = visit();
    const read = readShare(bytes, provider);
    expect(read.stored.length).toBe(bytes.length - ENTRY_BYTES);

    // Two days later the provider app asks, with a key made for this opening alone.
    const opening = newKeyPair();
    const request = sealRequest(read.pair, read.header.id, opening.publicKey, NOW + 2 * DAY);
    const almanac = almanacPair(share.sender, pairing.providerKey);
    const asked = openRequest(almanac, request)!;
    expect(hex(asked.share)).toBe(hex(share.id));
    expect(asked.asked).toBe(NOW + 2 * DAY);

    const approval = openEntry(read.pair, sealApproval(almanac, share.sender, share.id, asked.openingKey, NOW + 2 * DAY + 60 * MINUTE, share.shareKey));
    if (approval?.kind !== "approval") throw new Error("expected an approval");
    expect(approval.until).toBe(NOW + 2 * DAY + 60 * MINUTE);
    expect(problem(() => unmaskShareKey(approval, first, read.header.senderKey))).toBe("not-for-you");
    expect(hex(openStored(read.stored, unmaskShareKey(approval, opening, read.header.senderKey)).payload)).toBe(hex(PAYLOAD));
  });

  it("an approval opens only its own share", () => {
    const a = visit();
    const b = visit(utf8("another share"));
    const readA = readShare(a.bytes, a.provider);
    const readB = readShare(b.bytes, b.provider);
    const keyA = unmaskShareKey(readA.firstApproval, a.first, readA.header.senderKey);
    expect(problem(() => openStored(readB.stored, keyA))).toBe("not-for-you");
    const forA = sealApproval(almanacPair(a.share.sender, a.pairing.providerKey), a.share.sender, a.share.id, newKeyPair().publicKey, NOW, a.share.shareKey);
    expect(openEntry(readB.pair, forA)).toBeNull();
  });

  it("does not open once changed on the way", () => {
    const { bytes, provider, first } = visit();
    const opened = (changed: Uint8Array) => {
      const read = readShare(changed, provider);
      return openStored(read.stored, unmaskShareKey(read.firstApproval, first, read.header.senderKey));
    };
    const laterEnd = bytes.slice();
    laterEnd[2 + 16 + 32 + 3] ^= 1; // the last byte of the end date
    expect(problem(() => opened(laterEnd))).toBe("damaged");
    const flipped = bytes.slice();
    flipped[bytes.length - 1] ^= 1;
    expect(problem(() => opened(flipped))).toBe("not-for-you");
  });
});

describe("requests, approvals and stops", () => {
  it("keep their sizes: an approval and a stop cannot be told apart from outside", () => {
    const { share, pairing, provider } = visit();
    const almanac = almanacPair(share.sender, pairing.providerKey);
    const stop = sealStop(almanac, share.id, NOW);
    expect(stop.length).toBe(ENTRY_BYTES);
    expect(sealApproval(almanac, share.sender, share.id, newKeyPair().publicKey, NOW, share.shareKey).length).toBe(ENTRY_BYTES);
    expect(sealRequest(providerPair(provider, share.sender.publicKey), share.id, newKeyPair().publicKey, NOW).length).toBe(REQUEST_BYTES);
    expect([ENTRY_BYTES, REQUEST_BYTES]).toEqual([125, 93]);
    expect(openEntry(providerPair(provider, share.sender.publicKey), stop)).toMatchObject({ kind: "stop", at: NOW });
  });

  it("almanac reads only the requests sealed for that share", () => {
    const a = visit();
    const b = visit();
    const request = sealRequest(providerPair(a.provider, a.share.sender.publicKey), a.share.id, newKeyPair().publicKey, NOW);
    expect(openRequest(almanacPair(b.share.sender, b.pairing.providerKey), request)).toBeNull();
    expect(openRequest(almanacPair(a.share.sender, a.pairing.providerKey), request)).not.toBeNull();
  });
});
