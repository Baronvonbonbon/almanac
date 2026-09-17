import { randomBytes } from "@parity/product-sdk-crypto";
import { describe, expect, it } from "vitest";
import { hex } from "../lib/bytes";
import { ShareError, type ShareProblem } from "./errors";
import { FRAME_BYTES, joinFrames, readFrame, toFrames } from "./frames";

function problem(fn: () => unknown): ShareProblem | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof ShareError) return e.problem;
    throw e;
  }
  return null;
}

describe("a loop of codes", () => {
  it("carries a share in codes that can be read in any order, and more than once", () => {
    const bytes = randomBytes(4096);
    const codes = toFrames(bytes);
    expect(codes).toHaveLength(Math.ceil(4096 / FRAME_BYTES));
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-Z:/]+$/);
      expect(code.length).toBeLessThan(700);
    }
    const seen = [...codes].reverse().concat(codes.slice(0, 3)).map(readFrame);
    expect(hex(joinFrames(seen)!)).toBe(hex(bytes));
  });

  it("waits for every code, and leaves out another share's", () => {
    const bytes = randomBytes(2048);
    const a = toFrames(bytes).map(readFrame);
    const b = toFrames(randomBytes(2048)).map(readFrame);
    expect(joinFrames([])).toBeNull();
    expect(joinFrames(a.slice(1))).toBeNull();
    expect(hex(joinFrames([...b.slice(0, 2), ...a])!)).toBe(hex(bytes));
  });

  it("notices a code that changed on the way", () => {
    const frames = toFrames(randomBytes(2048)).map(readFrame);
    frames[1].chunk[0] ^= 1;
    expect(problem(() => joinFrames(frames))).toBe("damaged");
  });

  it("refuses text that isn't a share's code", () => {
    expect(problem(() => readFrame("ALMANAC:P:ABCDEF"))).toBe("format");
    expect(problem(() => readFrame("ALMANAC:S:3/2:ABCDEFGH:00"))).toBe("format");
    expect(problem(() => readFrame("ALMANAC:S:1/2:ABCDEFGH:UU"))).toBe("format");
  });

  it("reads a code however the camera hands it over, as a provider's code is read", () => {
    const bytes = randomBytes(600);
    const [first] = toFrames(bytes);
    // The same normalisation readPairingCode needed: the provider app scans these off the patient's
    // screen, so it met the identical failure from the other side.
    for (const text of [first.toLowerCase(), `\n${first}\n`, `  ${first}  `]) {
      expect(hex(readFrame(text).chunk)).toBe(hex(readFrame(first).chunk));
      expect(readFrame(text).tag).toBe(readFrame(first).tag);
    }
  });
});
