import { createFakeHost } from "@parity/product-sdk-host/testing";
import { describe, expect, it } from "vitest";
import { Vault } from "../vault";
import { detectHost, memoryHost } from ".";
import { polkadotHost } from "./polkadot";

// createFakeHost stands in for the Polkadot app, and removes itself when each test finishes.

describe("the Polkadot app's host, against the SDK's fake", () => {
  it("is found inside the app", async () => {
    createFakeHost();
    expect((await detectHost())?.kind).toBe("polkadot");
  });

  it("reads back what it wrote, and nothing once removed", async () => {
    createFakeHost();
    const { storage } = (await polkadotHost())!;
    expect(await storage.read("a/v1/meta")).toBeUndefined();
    await storage.write("a/v1/meta", new Uint8Array([1, 2, 3]));
    expect(await storage.read("a/v1/meta")).toEqual(new Uint8Array([1, 2, 3]));
    await storage.remove("a/v1/meta");
    expect(await storage.read("a/v1/meta")).toBeUndefined();
  });

  it("carries a vault", async () => {
    createFakeHost();
    const real = (await polkadotHost())!;
    // The fake does not model entropy, so it comes from a memory host.
    const host = { ...real, deriveEntropy: memoryHost("fake").deriveEntropy };
    const vault = await Vault.create(host, { N: 2 ** 10, r: 8, p: 1 });
    await vault.writeJSON("m/2026-09", { "2026-09-11": { flow: "light" } });
    const reopened = await Vault.open(host);
    expect(reopened.state).toBe("open");
    if (reopened.state === "open") expect(await reopened.vault.readJSON("m/2026-09")).toEqual({ "2026-09-11": { flow: "light" } });
  });
});
