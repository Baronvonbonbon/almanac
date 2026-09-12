import { deriveKey } from "@parity/product-sdk-crypto";
import { utf8 } from "../lib/bytes";
import type { Host, Storage } from "./host";

/** Storage in a Map. It can also list its contents, which tests use to inspect the raw store. */
export class MemoryStorage implements Storage {
  private readonly map = new Map<string, Uint8Array>();

  async read(key: string): Promise<Uint8Array | undefined> {
    return this.map.get(key)?.slice();
  }

  async write(key: string, value: Uint8Array): Promise<void> {
    this.map.set(key, value.slice());
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }

  keys(): string[] {
    return [...this.map.keys()].sort();
  }

  /** Byte length of every stored value, by key — the "shape" of the store. */
  shape(): Record<string, number> {
    return Object.fromEntries(this.keys().map((k) => [k, this.map.get(k)!.length]));
  }
}

export type MemoryHost = Host & { storage: MemoryStorage };

/**
 * A host with no Polkadot app behind it. `seed` stands in for the account the real host derives
 * entropy from: the same seed gives the same entropy, as the real host does across restarts. Pass an
 * existing `storage` to model the same phone opened by a different account.
 */
export function memoryHost(seed = "almanac-dev", storage = new MemoryStorage()): MemoryHost {
  return {
    kind: "memory",
    storage,
    async deriveEntropy(input) {
      return deriveKey(utf8(seed), "almanac/memory-host", input);
    },
  };
}
