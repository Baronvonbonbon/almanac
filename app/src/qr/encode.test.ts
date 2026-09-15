import { randomBytes } from "@parity/product-sdk-crypto";
import decodeQR from "qr/decode.js";
import { describe, expect, it } from "vitest";
import { newKeyPair, pairingCode, toFrames } from "../share";
import { QUIET_ZONE, qrModules, qrPath } from "./encode";

/** The code as a camera would see it: RGBA pixels, `scale` to a module. */
function photograph(modules: boolean[][], scale = 4) {
  const width = modules.length * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const at = ((y * scale + dy) * width + x * scale + dx) * 4;
          data[at] = data[at + 1] = data[at + 2] = 0;
        }
    }),
  );
  return { width, height: width, data };
}

/** QR versions are 17 + 4v modules across, without the quiet zone. */
const version = (modules: boolean[][]) => (modules.length - 2 * QUIET_ZONE - 17) / 4;

const PAIRING = pairingCode({ providerKey: newKeyPair().publicKey, firstOpeningKey: newKeyPair().publicKey, name: "Dr Okafor, Riverside Clinic" });
const FRAME = toFrames(randomBytes(2048))[0];

describe("QR codes", () => {
  it("read back exactly: a provider's code, and a full code of a share's loop", () => {
    for (const text of [PAIRING, FRAME]) expect(decodeQR(photograph(qrModules(text)))).toBe(text);
  });

  it("stay small enough for one phone to read off another's screen", () => {
    expect(version(qrModules(PAIRING))).toBeLessThanOrEqual(8);
    expect(version(qrModules(FRAME))).toBeLessThanOrEqual(20);
  });

  it("keep a quiet zone of four light modules on every side", () => {
    const modules = qrModules(PAIRING);
    const edge = [...modules.slice(0, QUIET_ZONE), ...modules.slice(-QUIET_ZONE)].flat();
    const sides = modules.flatMap((row) => [...row.slice(0, QUIET_ZONE), ...row.slice(-QUIET_ZONE)]);
    expect([...edge, ...sides].some(Boolean)).toBe(false);
  });

  it("draw every dark module once, and nothing else", () => {
    const modules = qrModules(PAIRING);
    const drawn = [...qrPath(modules).matchAll(/h(\d+)v1/g)].reduce((sum, m) => sum + Number(m[1]), 0);
    expect(drawn).toBe(modules.flat().filter(Boolean).length);
  });
});
