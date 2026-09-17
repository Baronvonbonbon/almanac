/**
 * Everything almanac asks of the platform, behind one interface — so the vault and the rest of the app
 * run the same against the Polkadot app's host and against the in-memory host used in dev and tests.
 *
 * Notifications and cloud storage join this interface with the phases that use them (reminders,
 * backups), once the probe has said how they behave on a phone.
 */

export interface Storage {
  /** `undefined` when the key has never been written, or was removed. */
  read(key: string): Promise<Uint8Array | undefined>;
  write(key: string, value: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * The statement store (docs/DESIGN.md §9), as almanac uses it: small statements, each replacing this
 * product's earlier one on the same channel, heard by anyone listening on one of its topics (P9).
 */
export interface StatementPort {
  /** Replaces this product's statement on `channel`. `expires` is a time in ms: up to 90 days ahead (P9). */
  publish(statement: { channel: Uint8Array; topics: Uint8Array[]; data: Uint8Array; expires: number }): Promise<void>;
  /** Hears the data of every statement on any of `topics` — those held already, then new ones — until the returned function is called. */
  listen(topics: Uint8Array[], heard: (data: Uint8Array) => void): () => void;
}

/**
 * Bulletin, as almanac uses it for backups (docs/DESIGN.md §8): put bytes, get them back by their
 * content hash. Absent where there is nowhere to put them — the web tryout.
 *
 * The hash is the 32 bytes a BLAKE2b-256 CID carries, never a CID string. The host's lookup takes the
 * digest alone (P7), and almanac only ever reads through the host, so nothing here builds or parses a
 * CID — which also keeps a multiformats library out of a bundle with 63 KiB of room left.
 */
export interface Blobs {
  /** Stores bytes and returns their 32-byte content hash. Throws when the host will not store them. */
  put(bytes: Uint8Array): Promise<Uint8Array>;
  /** The bytes for a content hash, or `null` when they cannot be found in time. */
  get(hash: Uint8Array): Promise<Uint8Array | null>;
}

export interface Host {
  readonly kind: "polkadot" | "memory";
  readonly storage: Storage;
  /** Deterministic for a given product and input: the root of almanac's device key. */
  deriveEntropy(input: Uint8Array): Promise<Uint8Array>;
  /**
   * Light or dark, from the host's theme — which can differ from the phone's own setting (P12). Absent
   * when the host has no theme to report. Returns a function that stops following it.
   */
  subscribeVariant?(callback: (variant: "light" | "dark") => void): () => void;
  /** Absent where there is no statement store: the web tryout. */
  readonly statements?: StatementPort;
  /** Absent where backups cannot be uploaded: the web tryout. */
  readonly blobs?: Blobs;
}
