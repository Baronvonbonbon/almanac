import { scryptAsync } from "@noble/hashes/scrypt.js";
import { concatBytes, deriveKey } from "@parity/product-sdk-crypto";
import { hex, utf8 } from "../lib/bytes";
import type { Host } from "../platform";

/**
 * The key hierarchy (docs/DESIGN.md §6). Every derivation here is load-bearing: changing one locks
 * every existing user out of their data, which is why keys.test.ts pins them to fixed vectors.
 */

export interface KdfParams {
  N: number;
  r: number;
  p: number;
}

/**
 * 169 ms on a Pixel 10 Pro XL (P11, 2026-09-13), so roughly 300–500 ms on a mid-range phone. Stored
 * per vault, so a later change needs no migration.
 */
export const DEFAULT_KDF: KdfParams = { N: 2 ** 16, r: 8, p: 1 };

const SALT = "almanac/v1";

/** The device key. Regenerated from the host's product-scoped entropy on every launch; never stored. */
export async function deviceKey(host: Host): Promise<Uint8Array> {
  return deriveKey(await host.deriveEntropy(utf8("almanac/v1/device")), SALT, "device");
}

/** Wraps a vault's key when no PIN is set. */
export const noPinKey = (device: Uint8Array): Uint8Array => deriveKey(device, SALT, "wrap/no-pin");

/**
 * Wraps a vault's key when a PIN is set. It needs the device key as well as the PIN, so storage copied
 * off the phone cannot be brute-forced offline — the device key only exists inside the host.
 */
export async function pinKey(device: Uint8Array, pin: string, salt: Uint8Array, kdf: KdfParams): Promise<Uint8Array> {
  const stretched = await scryptAsync(utf8(pin.normalize("NFKC")), salt, { ...kdf, dkLen: 32 });
  return deriveKey(concatBytes(device, stretched), SALT, "wrap/pin");
}

/** Seals the list of record names, which both vaults share. */
export const namesKey = (device: Uint8Array): Uint8Array => deriveKey(device, SALT, "names");

/** The storage key for a record name — opaque, so the store does not list months in the clear. */
export const recordKeyName = (device: Uint8Array, name: string): string =>
  hex(deriveKey(device, SALT, `record-name:${name}`)).slice(0, 32);
