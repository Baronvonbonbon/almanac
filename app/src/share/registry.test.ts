import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REGISTRY_KEY, REGISTRY_PUBLIC_KEY } from "./registry";

/**
 * The registry key is written twice — here in the app, where the bundle can carry it, and in the
 * repo's product.mjs, where the published identities are recorded. Two copies of a trust root is a
 * drift waiting to happen, so it is a test rather than a promise: change one and this fails.
 */
describe("the registry key", () => {
  it("is an Ed25519 public key", () => {
    expect(REGISTRY_PUBLIC_KEY).toMatch(/^[0-9a-f]{64}$/);
    expect(REGISTRY_KEY).toHaveLength(32);
  });

  it("is the one product.mjs records", () => {
    const source = readFileSync(new URL("../../../product.mjs", import.meta.url), "utf8");
    const declared = /REGISTRY_PUBLIC_KEY\s*=\s*"([0-9a-f]{64})"/.exec(source);
    expect(declared, "product.mjs declares no REGISTRY_PUBLIC_KEY").not.toBeNull();
    expect(declared![1]).toBe(REGISTRY_PUBLIC_KEY);
  });
});
