import { describe, expect, it } from "vitest";
import { memoryHost, type Host } from "./platform";
import { chooseHost } from "./startup";
import { Vault } from "./vault";

const FAST_KDF = { N: 2 ** 10, r: 8, p: 1 };
const never = new Promise<never>(() => {});
// The dev-dot.li web host on 2026-09-14: its storage answers, its entropy doesn't.
const notConnected = (host: Host): Host => ({ ...host, deriveEntropy: () => Promise.reject(new Error("deriveEntropy: Unknown: Not connected")) });

describe("which host almanac runs on", () => {
  it("runs on a host that answers and derives almanac's key", async () => {
    const host = memoryHost("answers");
    expect(await chooseHost(Promise.resolve(host))).toBe(host);
  });

  it("opens the tryout in a plain browser", async () => {
    expect(await chooseHost(Promise.resolve(null))).toBeNull();
  });

  it("opens the tryout when the host never answers", async () => {
    expect(await chooseHost(never, 20)).toBeNull();
  });

  it("opens the tryout when the host's storage never answers", async () => {
    // A frame with no host behind it: the SDK hands out storage whose reads never return.
    const host = memoryHost("silent");
    host.storage.read = () => never;
    expect(await chooseHost(Promise.resolve(host), 20)).toBeNull();
  });

  it("opens the tryout when the host can't derive almanac's key and nothing is saved yet", async () => {
    expect(await chooseHost(Promise.resolve(notConnected(memoryHost("new"))))).toBeNull();
  });

  it("opens the tryout when deriving the key never finishes", async () => {
    const host: Host = { ...memoryHost("slow"), deriveEntropy: () => never };
    expect(await chooseHost(Promise.resolve(host), 20)).toBeNull();
  });

  it("keeps a host that holds a vault, even when it can't derive the key", async () => {
    const saved = memoryHost("saved");
    await Vault.create(saved, FAST_KDF);
    const host = notConnected(saved);
    expect(await chooseHost(Promise.resolve(host))).toBe(host);
  });

  it("reports a host that failed to start", async () => {
    await expect(chooseHost(Promise.reject(new Error("no storage")))).rejects.toThrow("no storage");
  });
});
