import { describe, expect, it } from "vitest";
import { memoryHost } from "../platform";
import { readLook, Vault, writeLook, type KdfParams } from ".";

const FAST: KdfParams = { N: 2 ** 10, r: 8, p: 1 };

describe("the chosen look", () => {
  it("is unset until chosen, and can be chosen before a vault exists", async () => {
    const host = memoryHost();
    expect(await readLook(host)).toBeNull();
    await writeLook(host, "moonpaper");
    expect(await readLook(host)).toBe("moonpaper");
  });

  it("reads before unlock, whichever vault the PIN will open", async () => {
    const host = memoryHost();
    const vault = await Vault.create(host, FAST);
    await vault.setPin("2468");
    await vault.setDuressPin("1357");
    await writeLook(host, "pebble");
    expect((await Vault.open(host)).state).toBe("locked");
    expect(await readLook(host)).toBe("pebble");
  });

  it("is not stored in the clear", async () => {
    const host = memoryHost();
    await writeLook(host, "moonpaper");
    expect(new TextDecoder().decode(await host.storage.read("a/v1/look"))).not.toContain("moonpaper");
  });

  it("cannot be read by a different account on the same phone", async () => {
    const host = memoryHost("first");
    await writeLook(host, "pebble");
    await expect(readLook(memoryHost("second", host.storage))).rejects.toThrow();
  });

  it("is removed by erase, with or without a vault", async () => {
    const host = memoryHost();
    await writeLook(host, "pebble");
    await Vault.erase(host);
    expect(await readLook(host)).toBeNull();
    await Vault.create(host, FAST);
    await writeLook(host, "moonpaper");
    await Vault.erase(host);
    expect(host.storage.keys()).toEqual([]);
  });
});
