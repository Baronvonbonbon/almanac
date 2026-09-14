import { describe, expect, it } from "vitest";
import { memoryHost } from "../platform";
import { readTries, rightPin, Vault, waitAfter, wrongPin, type KdfParams } from ".";

const FAST: KdfParams = { N: 2 ** 10, r: 8, p: 1 };

describe("wrong PINs", () => {
  it("allow five tries, then waits that grow to an hour — and never wipe anything", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 20].map((n) => waitAfter(n) / 1000)).toEqual([0, 0, 0, 0, 30, 60, 300, 900, 3600, 3600]);
  });

  it("are counted across launches, and cleared by the right PIN", async () => {
    const host = memoryHost();
    await Vault.create(host, FAST);
    expect(await readTries(host)).toEqual({ n: 0, until: 0 });
    for (let i = 0; i < 4; i++) await wrongPin(host, 1000);
    expect(await wrongPin(host, 1000)).toEqual({ n: 5, until: 31_000 });
    expect(await readTries(host)).toEqual({ n: 5, until: 31_000 });
    await rightPin(host);
    expect(await readTries(host)).toEqual({ n: 0, until: 0 });
  });

  it("are kept sealed, at one size, from the first launch", async () => {
    const host = memoryHost();
    await Vault.create(host, FAST);
    const size = host.storage.shape()["a/v1/tries"];
    expect(size).toBeGreaterThan(0);
    for (let i = 0; i < 12; i++) await wrongPin(host, 1e12);
    expect(host.storage.shape()["a/v1/tries"]).toBe(size);
  });
});
