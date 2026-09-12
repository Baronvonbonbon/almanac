import { scrypt } from "@noble/hashes/scrypt.js";
import { deriveKey } from "@parity/product-sdk-crypto";
import { describe, expect, it } from "vitest";
import { fromHex, hex, text, utf8 } from "../lib/bytes";
import type { Host } from "../platform";
import { open, PAD } from "./codec";
import { deviceKey, namesKey, noPinKey, pinKey, recordKeyName } from "./keys";
import vectors from "./vectors.json";

describe("primitives", () => {
  it("deriveKey is HKDF-SHA256 (RFC 5869, test case 1)", () => {
    const okm = deriveKey(fromHex("0b".repeat(22)), fromHex("000102030405060708090a0b0c"), fromHex("f0f1f2f3f4f5f6f7f8f9"));
    expect(hex(okm)).toBe("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf");
  });

  it("scrypt matches RFC 7914", () => {
    const out = scrypt(utf8("password"), utf8("NaCl"), { N: 1024, r: 8, p: 16, dkLen: 64 });
    expect(hex(out)).toBe(
      "fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b3731622eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640",
    );
  });
});

// Pinned to vectors.json, generated once from the v1 code. A failure here means existing vaults no
// longer open: change the derivation only with a migration, and a new format version.
describe("v1 key hierarchy", () => {
  it("asks the host for the same entropy, and derives the same keys", async () => {
    const asked: string[] = [];
    const host: Host = {
      kind: "memory",
      storage: undefined as never,
      deriveEntropy: async (input) => {
        asked.push(text(input));
        return fromHex(vectors.entropy);
      },
    };
    const device = await deviceKey(host);
    expect(asked).toEqual(["almanac/v1/device"]);
    expect(hex(device)).toBe(vectors.device);
    expect(hex(noPinKey(device))).toBe(vectors.noPin);
    expect(hex(namesKey(device))).toBe(vectors.names);
    expect(recordKeyName(device, vectors.recordName.name)).toBe(vectors.recordName.id);
    const { pin, salt, kdf, key } = vectors.pin;
    expect(hex(await pinKey(device, pin, fromHex(salt), kdf))).toBe(key);
  });

  it("opens a record sealed by v1", () => {
    const { key, name, data, sealed } = vectors.record;
    expect(fromHex(sealed).length).toBe(PAD);
    expect(text(open(fromHex(key), name, fromHex(sealed)))).toBe(data);
  });
});
