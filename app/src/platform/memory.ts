import { blake2b256, deriveKey } from "@parity/product-sdk-crypto";
import { hex, utf8 } from "../lib/bytes";
import type { Blobs, Host, StatementPort, Storage } from "./host";

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

interface Held {
  topics: string[];
  data: Uint8Array;
  expires: number;
}

/**
 * A statement store in memory, behaving as P9 found the real one does: a statement replaces its
 * account's earlier one on the same channel, and a listener hears what is held already, then what
 * arrives — a moment later, as the real one delivers. Each account publishes through a port of its own.
 */
export class MemoryStatements {
  private readonly held = new Map<string, Held>();
  private readonly listeners = new Set<{ topics: string[]; heard(data: Uint8Array): void }>();

  constructor(private readonly now: () => number = Date.now) {}

  port(account: string): StatementPort {
    return {
      publish: async ({ channel, topics, data, expires }) => {
        if (topics.length > 4) throw new Error("a statement has at most four topics");
        const statement = { topics: topics.map(hex), data: data.slice(), expires };
        this.held.set(`${account} ${hex(channel)}`, statement);
        for (const listener of this.listeners) if (matches(listener.topics, statement)) this.tell(listener, statement.data);
      },
      listen: (topics, heard) => {
        const listener = { topics: topics.map(hex), heard };
        this.listeners.add(listener);
        for (const statement of this.held.values()) if (statement.expires > this.now() && matches(listener.topics, statement)) this.tell(listener, statement.data);
        return () => void this.listeners.delete(listener);
      },
    };
  }

  /** What an account holds on a channel, for tests to look at. */
  heldBy(account: string, channel: Uint8Array): Held | undefined {
    return this.held.get(`${account} ${hex(channel)}`);
  }

  private tell(listener: { heard(data: Uint8Array): void }, data: Uint8Array) {
    queueMicrotask(() => {
      if (this.listeners.has(listener as never)) listener.heard(data.slice());
    });
  }
}

const matches = (topics: string[], statement: Held) => statement.topics.some((t) => topics.includes(t));

/**
 * Bulletin in a Map, keyed by content hash as the real one is. It never forgets, which the real one
 * does after about a fortnight (P7) — so a test that cares about a backup expiring must say so itself.
 */
export class MemoryBlobs implements Blobs {
  private readonly map = new Map<string, Uint8Array>();

  async put(bytes: Uint8Array): Promise<Uint8Array> {
    const hash = blake2b256(bytes);
    this.map.set(hex(hash), bytes.slice());
    return hash;
  }

  async get(hash: Uint8Array): Promise<Uint8Array | null> {
    return this.map.get(hex(hash))?.slice() ?? null;
  }

  /** What it holds, for tests: how many blobs, and how large each is. */
  sizes(): number[] {
    return [...this.map.values()].map((b) => b.length);
  }

  /** Drops everything, standing in for Bulletin letting a backup expire. */
  forget(): void {
    this.map.clear();
  }
}

export type MemoryHost = Host & { storage: MemoryStorage };

/**
 * A host with no Polkadot app behind it. `seed` stands in for the account the real host derives
 * entropy from: the same seed gives the same entropy, as the real host does across restarts. Pass an
 * existing `storage` to model the same phone opened by a different account, and `statements` to give
 * it a statement store — the web tryout has none.
 */
export function memoryHost(seed = "almanac-dev", storage = new MemoryStorage(), statements?: StatementPort, blobs?: Blobs): MemoryHost {
  return {
    kind: "memory",
    storage,
    ...(statements ? { statements } : {}),
    ...(blobs ? { blobs } : {}),
    async deriveEntropy(input) {
      return deriveKey(utf8(seed), "almanac/memory-host", input);
    },
  };
}
