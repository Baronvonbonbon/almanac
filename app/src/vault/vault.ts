import { randomBytes } from "@parity/product-sdk-crypto";
import { fromHex, hex, text, utf8 } from "../lib/bytes";
import type { Host } from "../platform";
import { RecordError, lengthen, open, seal, unwrapKey, wrapKey, WRAPPED_KEY_BYTES } from "./codec";
import { DEFAULT_KDF, deviceKey, namesKey, noPinKey, pinKey, recordKeyName, type KdfParams } from "./keys";

/**
 * almanac's encrypted store (docs/DESIGN.md §6).
 *
 * There are always two slots, from the first launch: this vault's, and one holding either a duress
 * decoy or random bytes of exactly the same shape. Every record is mirrored: under each record name,
 * both slots hold bytes of the same length, and that length never shrinks. So a copy of the store
 * shows how large a record has ever been, but not which slot is in use, or whether a decoy exists.
 * (Two copies taken at different times do show which slot changed — docs/THREAT-MODEL.md.) Which slot
 * is "real" is recorded nowhere: a PIN opens whichever slot it unwraps.
 *
 * Storage layout (all under the host's per-product namespace):
 *
 *   a/v1/meta          plaintext: format version, scrypt salt and parameters — the same with or without a PIN
 *   a/v1/slots         two wrapped keys, 72 bytes each
 *   a/v1/names         every record name, sealed under a device-level key both vaults share
 *   a/v1/look          the chosen look, sealed under the same key
 *   a/v1/tries         wrong PINs in a row, sealed under the same key — written from the first launch,
 *                      so its presence says nothing about whether a PIN is set
 *   a/v1/r/<s>/<id>    records: slot s, opaque id derived from the record name
 */

const META = "a/v1/meta";
const SLOTS = "a/v1/slots";
const NAMES = "a/v1/names";
const LOOK = "a/v1/look";
const TRIES = "a/v1/tries";
/** The vault's own state: the names it has written, and the duress erase flag. */
const STATE = "_vault";

type Slot = 0 | 1;
const SLOT_IDS: Slot[] = [0, 1];
const otherSlot = (s: Slot): Slot => (s === 0 ? 1 : 0);

interface Meta {
  v: 1;
  salt: string;
  kdf: KdfParams;
}

interface VaultState {
  names: string[];
  /** Set on a decoy whose owner chose "also erase the real data": opening it shreds the other slot. */
  eraseOtherOnOpen?: boolean;
}

export type VaultErrorCode = "exists" | "damaged" | "pin-required" | "pin-in-use" | "reserved-name";

export class VaultError extends Error {
  constructor(
    readonly code: VaultErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

export type OpenResult = { state: "new" } | { state: "open"; vault: Vault } | { state: "locked" };

const recordKey = (device: Uint8Array, slot: Slot, name: string) => `a/v1/r/${slot}/${recordKeyName(device, name)}`;

async function readMeta(host: Host): Promise<Meta | null> {
  const bytes = await host.storage.read(META);
  if (!bytes) return null;
  const meta = JSON.parse(text(bytes)) as Meta;
  if (meta.v !== 1) throw new VaultError("damaged", `unknown vault format ${meta.v}`);
  return meta;
}

async function readSlots(host: Host): Promise<Uint8Array> {
  const slots = await host.storage.read(SLOTS);
  if (slots?.length !== 2 * WRAPPED_KEY_BYTES) throw new VaultError("damaged", "the slot record is missing or damaged");
  return slots;
}

const slotBytes = (slots: Uint8Array, s: Slot) => slots.subarray(s * WRAPPED_KEY_BYTES, (s + 1) * WRAPPED_KEY_BYTES);

async function readNames(host: Host, device: Uint8Array): Promise<string[]> {
  const sealed = await host.storage.read(NAMES);
  return sealed ? (JSON.parse(text(open(namesKey(device), "names", sealed))) as string[]) : [];
}

/**
 * The look the user picked (docs/DESIGN.md §4). It belongs to the phone, not to a vault: it opens with
 * the device key alone, so the lock screen can show it before any PIN, and the real and decoy vaults
 * share it — a decoy that opened in a different look would give itself away. `null` if never chosen.
 * The value is not checked here; the caller falls back to the default look for anything it does not
 * know.
 */
export async function readLook(host: Host): Promise<string | null> {
  const sealed = await host.storage.read(LOOK);
  return sealed ? text(open(namesKey(await deviceKey(host)), "look", sealed)) : null;
}

export async function writeLook(host: Host, look: string): Promise<void> {
  await host.storage.write(LOOK, seal(namesKey(await deviceKey(host)), "look", utf8(look)));
}

/** Wrong PINs in a row — one count for both slots — and when the next try is allowed (ms since 1970). */
export interface Tries {
  n: number;
  until: number;
}

const NO_TRIES: Tries = { n: 0, until: 0 };

/**
 * docs/DESIGN.md §6: five tries, then waits that grow — 30 seconds, a minute, 5 minutes, 15 minutes,
 * then an hour each time. Nothing is ever wiped. `n` is the number of wrong PINs so far.
 */
export function waitAfter(n: number): number {
  const seconds = [0, 0, 0, 0, 0, 30, 60, 300, 900];
  return (n < seconds.length ? seconds[n] : 3600) * 1000;
}

export async function readTries(host: Host): Promise<Tries> {
  const sealed = await host.storage.read(TRIES);
  if (!sealed) return NO_TRIES;
  try {
    return JSON.parse(text(open(namesKey(await deviceKey(host)), "tries", sealed))) as Tries;
  } catch {
    // Unreadable is treated as none. The count only slows guessing inside the app; outside it the PIN
    // is no use without the device key (docs/THREAT-MODEL.md R4).
    return NO_TRIES;
  }
}

async function writeTries(host: Host, tries: Tries): Promise<void> {
  await host.storage.write(TRIES, seal(namesKey(await deviceKey(host)), "tries", utf8(JSON.stringify(tries))));
}

/** Counts a wrong PIN, and returns the new count and wait. */
export async function wrongPin(host: Host, now = Date.now()): Promise<Tries> {
  const n = (await readTries(host)).n + 1;
  const tries = { n, until: now + waitAfter(n) };
  await writeTries(host, tries);
  return tries;
}

export const rightPin = (host: Host): Promise<void> => writeTries(host, NO_TRIES);

export class Vault {
  #queue: Promise<unknown> = Promise.resolve();
  #state: VaultState | null = null;

  private constructor(
    private readonly host: Host,
    private readonly device: Uint8Array,
    private readonly meta: Meta,
    private readonly slot: Slot,
    private readonly key: Uint8Array,
    private lock: "none" | "pin",
  ) {}

  /** First launch: two slots, no PIN. `records` start it off — a restored backup — before it counts as existing. */
  static async create(host: Host, kdf: KdfParams = DEFAULT_KDF, records: Record<string, unknown> = {}): Promise<Vault> {
    if (await host.storage.read(META)) throw new VaultError("exists", "a vault already exists");
    const device = await deviceKey(host);
    const meta: Meta = { v: 1, salt: hex(randomBytes(16)), kdf };
    const slot = (randomBytes(1)[0] & 1) as Slot;
    const key = randomBytes(32);
    const slots = randomBytes(2 * WRAPPED_KEY_BYTES);
    slots.set(wrapKey(noPinKey(device), key), slot * WRAPPED_KEY_BYTES);
    await host.storage.write(SLOTS, slots);
    const vault = new Vault(host, device, meta, slot, key, "none");
    await vault.saveState({ names: [] });
    await vault.putRecords(records);
    await writeTries(host, NO_TRIES);
    // Written last: its presence is what says a vault exists.
    await host.storage.write(META, utf8(JSON.stringify(meta)));
    return vault;
  }

  /** Opens the vault if no PIN is set. */
  static async open(host: Host): Promise<OpenResult> {
    const meta = await readMeta(host);
    if (!meta) return { state: "new" };
    const device = await deviceKey(host);
    const vault = await Vault.withKey(host, device, meta, noPinKey(device), "none");
    return vault ? { state: "open", vault } : { state: "locked" };
  }

  /** Whether the host holds a vault, found without opening it or asking the host for entropy. */
  static async exists(host: Host): Promise<boolean> {
    return (await host.storage.read(META)) !== undefined;
  }

  /** Opens whichever vault the PIN unwraps — the real one or the decoy — or returns `null`. */
  static async unlock(host: Host, pin: string): Promise<Vault | null> {
    const meta = await readMeta(host);
    if (!meta) return null;
    const device = await deviceKey(host);
    const wrapping = await pinKey(device, pin, fromHex(meta.salt), meta.kdf);
    const vault = await Vault.withKey(host, device, meta, wrapping, "pin");
    if (vault) await vault.honourEraseOnOpen();
    return vault;
  }

  /**
   * Erase everything. Both wrapped keys are overwritten with random bytes first — after that no record
   * can be opened, whatever happens to the removals that follow.
   */
  static async erase(host: Host): Promise<void> {
    // The look can be chosen before a vault exists: onboarding asks for it first.
    if (!(await host.storage.read(META))) {
      for (const key of [LOOK, TRIES]) await host.storage.remove(key);
      return;
    }
    await host.storage.write(SLOTS, randomBytes(2 * WRAPPED_KEY_BYTES));
    const device = await deviceKey(host);
    let names: string[] = [];
    try {
      names = await readNames(host, device);
    } catch {
      // A damaged name list leaves some records behind, unopenable; nothing else to do.
    }
    for (const name of names) for (const s of SLOT_IDS) await host.storage.remove(recordKey(device, s, name));
    for (const key of [LOOK, TRIES, NAMES, SLOTS, META]) await host.storage.remove(key);
  }

  private static async withKey(host: Host, device: Uint8Array, meta: Meta, wrapping: Uint8Array, lock: "none" | "pin") {
    const slots = await readSlots(host);
    // Both slots are always tried, so neither the result nor the work reveals which one holds what.
    const keys = SLOT_IDS.map((s) => unwrapKey(wrapping, slotBytes(slots, s)));
    const slot = SLOT_IDS.find((s) => keys[s]);
    return slot === undefined ? null : new Vault(host, device, meta, slot, keys[slot]!, lock);
  }

  get locked(): boolean {
    return this.lock === "pin";
  }

  async read(name: string): Promise<Uint8Array | null> {
    assertPublic(name);
    return this.run(() => this.getRecord(name));
  }

  async write(name: string, data: Uint8Array): Promise<void> {
    assertPublic(name);
    return this.run(() => this.putRecord(name, data));
  }

  async readJSON<T>(name: string): Promise<T | null> {
    const bytes = await this.read(name);
    return bytes ? (JSON.parse(text(bytes)) as T) : null;
  }

  writeJSON(name: string, value: unknown): Promise<void> {
    return this.write(name, utf8(JSON.stringify(value)));
  }

  /** Reads, changes and writes one record as a single step, so changes made at the same time are not lost. */
  async updateJSON<T>(name: string, change: (current: T | null) => T): Promise<void> {
    assertPublic(name);
    return this.run(async () => {
      const bytes = await this.getRecord(name);
      await this.putRecord(name, utf8(JSON.stringify(change(bytes ? (JSON.parse(text(bytes)) as T) : null))));
    });
  }

  /** The names of this vault's records that start with `prefix`, sorted. */
  async list(prefix = ""): Promise<string[]> {
    return this.run(async () => (await this.loadState()).names.filter((n) => n.startsWith(prefix)).sort());
  }

  /** Set, change or (with `null`) remove the PIN. Removing it also removes any duress decoy. */
  setPin(pin: string | null): Promise<void> {
    return this.run(async () => {
      const slots = await readSlots(this.host);
      if (pin === null) {
        slots.set(wrapKey(noPinKey(this.device), this.key), this.slot * WRAPPED_KEY_BYTES);
        // A decoy only makes sense behind a PIN, so the other slot goes back to random bytes.
        slots.set(randomBytes(WRAPPED_KEY_BYTES), otherSlot(this.slot) * WRAPPED_KEY_BYTES);
        this.lock = "none";
      } else {
        const wrapping = await this.pinKey(pin);
        if (unwrapKey(wrapping, slotBytes(slots, otherSlot(this.slot)))) {
          throw new VaultError("pin-in-use", "that PIN is already the duress PIN");
        }
        slots.set(wrapKey(wrapping, this.key), this.slot * WRAPPED_KEY_BYTES);
        this.lock = "pin";
      }
      await this.host.storage.write(SLOTS, slots);
    });
  }

  /** Whether `pin` is this vault's own PIN — asked before any protection changes. */
  isPin(pin: string): Promise<boolean> {
    return this.run(async () => this.lock === "pin" && unwrapKey(await this.pinKey(pin), slotBytes(await readSlots(this.host), this.slot)) !== null);
  }

  /**
   * Set up a duress PIN, which opens a separate vault, starting with `records` — so it need not look
   * new. Replaces any earlier decoy. With `eraseRealOnUse`, opening the decoy also destroys this vault —
   * irreversibly.
   *
   * Called from inside a decoy, this replaces the vault it hides — as it must, or the decoy would give
   * itself away (docs/THREAT-MODEL.md R3).
   */
  setDuressPin(pin: string, options: { eraseRealOnUse?: boolean; records?: Record<string, unknown> } = {}): Promise<void> {
    return this.run(async () => {
      if (this.lock !== "pin") throw new VaultError("pin-required", "a duress PIN needs a PIN");
      const wrapping = await this.pinKey(pin);
      const slots = await readSlots(this.host);
      if (unwrapKey(wrapping, slotBytes(slots, this.slot))) throw new VaultError("pin-in-use", "that PIN is already the PIN");
      const decoy = new Vault(this.host, this.device, this.meta, otherSlot(this.slot), randomBytes(32), "pin");
      // The decoy's records first: a crash before the slot write then breaks only the decoy being replaced.
      await decoy.saveState(options.eraseRealOnUse ? { names: [], eraseOtherOnOpen: true } : { names: [] });
      await decoy.putRecords(options.records ?? {});
      slots.set(wrapKey(wrapping, decoy.key), decoy.slot * WRAPPED_KEY_BYTES);
      await this.host.storage.write(SLOTS, slots);
    });
  }

  /** Removes the duress PIN, and with it the way into the decoy. Like setDuressPin, it acts on the other slot. */
  removeDuressPin(): Promise<void> {
    return this.run(async () => {
      const slots = await readSlots(this.host);
      slots.set(randomBytes(WRAPPED_KEY_BYTES), otherSlot(this.slot) * WRAPPED_KEY_BYTES);
      await this.host.storage.write(SLOTS, slots);
    });
  }

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(fn, fn);
    this.#queue = next.catch(() => {});
    return next;
  }

  private pinKey(pin: string): Promise<Uint8Array> {
    return pinKey(this.device, pin, fromHex(this.meta.salt), this.meta.kdf);
  }

  private async getRecord(name: string): Promise<Uint8Array | null> {
    const sealed = await this.host.storage.read(recordKey(this.device, this.slot, name));
    if (!sealed) return null;
    try {
      return open(this.key, name, sealed);
    } catch (e) {
      // Under this slot, a name this vault never wrote holds filler mirrored from the other slot, which by
      // design looks like ciphertext. A name it did write must open.
      if (e instanceof RecordError && e.kind === "auth" && !(await this.loadState()).names.includes(name)) return null;
      throw e;
    }
  }

  private async putRecord(name: string, data: Uint8Array): Promise<void> {
    const sealed = seal(this.key, name, data);
    const own = recordKey(this.device, this.slot, name);
    const mirror = recordKey(this.device, otherSlot(this.slot), name);
    const [ownBytes, mirrorBytes] = await Promise.all([this.host.storage.read(own), this.host.storage.read(mirror)]);
    // Bytes under the other slot may be the other vault's data, so they are only ever lengthened with
    // random bytes, never replaced. open() skips anything past a sealed record.
    const length = Math.max(sealed.length, ownBytes?.length ?? 0, mirrorBytes?.length ?? 0);
    await this.host.storage.write(own, lengthen(sealed, length));
    if ((mirrorBytes?.length ?? 0) < length) {
      await this.host.storage.write(mirror, lengthen(mirrorBytes ?? new Uint8Array(0), length));
    }
    if (name !== STATE) {
      const state = await this.loadState();
      if (!state.names.includes(name)) await this.saveState({ ...state, names: [...state.names, name] });
    }
    await this.addName(name);
  }

  private async putRecords(records: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(records)) {
      assertPublic(name);
      await this.putRecord(name, utf8(JSON.stringify(value)));
    }
  }

  private async loadState(): Promise<VaultState> {
    if (this.#state) return this.#state;
    const sealed = await this.host.storage.read(recordKey(this.device, this.slot, STATE));
    if (!sealed) throw new VaultError("damaged", "the vault's state record is missing");
    this.#state = JSON.parse(text(open(this.key, STATE, sealed))) as VaultState;
    return this.#state;
  }

  private async saveState(state: VaultState): Promise<void> {
    this.#state = state;
    await this.putRecord(STATE, utf8(JSON.stringify(state)));
  }

  private async addName(name: string): Promise<void> {
    const names = await readNames(this.host, this.device);
    if (names.includes(name)) return;
    const sealed = seal(namesKey(this.device), "names", utf8(JSON.stringify([...names, name])));
    await this.host.storage.write(NAMES, sealed);
  }

  private async honourEraseOnOpen(): Promise<void> {
    const state = await this.loadState();
    if (!state.eraseOtherOnOpen) return;
    const slots = await readSlots(this.host);
    slots.set(randomBytes(WRAPPED_KEY_BYTES), otherSlot(this.slot) * WRAPPED_KEY_BYTES);
    await this.host.storage.write(SLOTS, slots);
    // Clear the flag too, so the decoy keeps no trace of what it did.
    await this.saveState({ names: state.names });
  }
}

function assertPublic(name: string) {
  if (name.startsWith("_")) throw new VaultError("reserved-name", `record names starting with "_" are reserved`);
}
