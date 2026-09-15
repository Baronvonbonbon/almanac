import { describe, expect, it } from "vitest";
import { fromBase32, toBase32 } from "../lib/base32";
import { fromHex, hex } from "../lib/bytes";
import { checkDigits, dh, keyPairFrom, openingMask, pairKeys } from "./keys";
import { pairingCode, readPairingCode } from "./pairing";
import { REQUESTS_CHANNEL, SHARING_CHANNEL } from "./statement";
import vectors from "./vectors.json";

const v = vectors.keys;

describe("share keys", () => {
  it("match vectors computed independently", () => {
    const sender = keyPairFrom(fromHex(v.senderSecret));
    const provider = keyPairFrom(fromHex(v.providerSecret));
    const opening = keyPairFrom(fromHex(v.openingSecret));
    expect(hex(sender.publicKey)).toBe(v.senderPublic);
    expect(hex(provider.publicKey)).toBe(v.providerPublic);
    expect(hex(opening.publicKey)).toBe(v.openingPublic);

    const shared = dh(sender.secretKey, provider.publicKey);
    expect(hex(shared)).toBe(v.shared);
    expect(hex(dh(provider.secretKey, sender.publicKey))).toBe(v.shared);
    const pair = pairKeys(shared, sender.publicKey, provider.publicKey);
    expect(hex(pair.toProvider)).toBe(v.toProvider);
    expect(hex(pair.toAlmanac)).toBe(v.toAlmanac);
    expect(hex(pair.requestTopic)).toBe(v.requestTopic);
    expect(hex(pair.answerTopic)).toBe(v.answerTopic);
    expect(checkDigits(provider.publicKey)).toBe(v.check);

    const openingShared = dh(sender.secretKey, opening.publicKey);
    expect(hex(openingShared)).toBe(v.openingShared);
    expect(hex(dh(opening.secretKey, sender.publicKey))).toBe(v.openingShared);
    expect(hex(openingMask(openingShared, sender.publicKey, opening.publicKey))).toBe(v.openingMask);

    expect(hex(SHARING_CHANNEL)).toBe(vectors.channels.sharing);
    expect(hex(REQUESTS_CHANNEL)).toBe(vectors.channels.requests);
  });

  it("write the provider's code as an independent encoder does", () => {
    const code = pairingCode({ providerKey: fromHex(v.providerPublic), firstOpeningKey: fromHex(v.openingPublic), name: vectors.pairing.name });
    expect(code).toBe(vectors.pairing.code);
    expect(readPairingCode(code).check).toBe(v.check);
  });

  it("refuses a key that would make every shared secret the same", () => {
    expect(() => dh(fromHex(v.senderSecret), new Uint8Array(32))).toThrow("not a usable key");
  });

  it("write and read base32 as an independent encoder does, in either case", () => {
    for (const b of vectors.base32) {
      expect(toBase32(fromHex(b.bytes))).toBe(b.text);
      expect(hex(fromBase32(b.text))).toBe(b.bytes);
      expect(hex(fromBase32(b.text.toLowerCase()))).toBe(b.bytes);
    }
    // U is not in the alphabet; "ZZ" has bits left over that toBase32 would have written as zeros.
    for (const bad of ["U0", "ZZ", "0"]) expect(() => fromBase32(bad)).toThrow("not base32");
  });
});
