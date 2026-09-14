/**
 * Everything almanac asks of the platform, behind one interface — so the vault and the rest of the app
 * run the same against the Polkadot app's host and against the in-memory host used in dev and tests.
 *
 * Notifications, cloud storage and the statement store join this interface with the phases that use
 * them (reminders, backups, sharing), once the probe has said how they behave on a phone.
 */

export interface Storage {
  /** `undefined` when the key has never been written, or was removed. */
  read(key: string): Promise<Uint8Array | undefined>;
  write(key: string, value: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
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
}
