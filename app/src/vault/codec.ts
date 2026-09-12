import { randomBytes, xchachaDecryptPacked, xchachaEncryptPacked } from "@parity/product-sdk-crypto";
import { text, utf8 } from "../lib/bytes";

/** Stored records grow in steps of this many bytes, so a record's size says only roughly what is in it. */
export const PAD = 1024;

/** XChaCha20-Poly1305 packed output: a 24-byte nonce in front, a 16-byte tag behind. */
export const SEAL_OVERHEAD = 24 + 16;

/** A 32-byte key, sealed. */
export const WRAPPED_KEY_BYTES = 32 + SEAL_OVERHEAD;

const MAGIC = [0x41, 0x4c, 0x52, 0x31]; // "ALR1"

export class RecordError extends Error {
  constructor(
    /** auth — does not open with this key. name — opens, but belongs to another record. format — malformed. */
    readonly kind: "auth" | "name" | "format",
    message: string,
  ) {
    super(message);
    this.name = "RecordError";
  }
}

/**
 * The plaintext of a record:
 *
 *   "ALR1" | u8 name length | name (UTF-8) | u32 LE data length | data | zero padding
 *
 * padded so that the sealed record is a multiple of PAD. The name is checked on read, so a record
 * copied onto another key fails loudly instead of showing the wrong month.
 */
export function frame(name: string, data: Uint8Array): Uint8Array {
  const n = utf8(name);
  if (n.length === 0 || n.length > 255) throw new RangeError("record names are 1–255 bytes");
  const used = MAGIC.length + 1 + n.length + 4 + data.length;
  const out = new Uint8Array(Math.ceil((used + SEAL_OVERHEAD) / PAD) * PAD - SEAL_OVERHEAD);
  out.set(MAGIC, 0);
  out[4] = n.length;
  out.set(n, 5);
  new DataView(out.buffer).setUint32(5 + n.length, data.length, true);
  out.set(data, 9 + n.length);
  return out;
}

export function unframe(name: string, plain: Uint8Array): Uint8Array {
  if (plain.length < 9 || MAGIC.some((b, i) => plain[i] !== b)) throw new RecordError("format", "not an almanac record");
  const nameLength = plain[4];
  const found = text(plain.subarray(5, 5 + nameLength));
  if (found !== name) throw new RecordError("name", `the record under "${name}" belongs to "${found}"`);
  const start = 9 + nameLength;
  const length = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(5 + nameLength, true);
  if (start + length > plain.length) throw new RecordError("format", "record length out of range");
  return plain.slice(start, start + length);
}

export function seal(key: Uint8Array, name: string, data: Uint8Array): Uint8Array {
  return xchachaEncryptPacked(frame(name, data), key);
}

/**
 * Opens a stored record: a sealed record, possibly followed by random bytes (the vault lengthens
 * records to keep both slots the same size). A sealed record is a whole number of PADs, so each such
 * prefix is tried until one authenticates.
 */
export function open(key: Uint8Array, name: string, stored: Uint8Array): Uint8Array {
  for (let length = PAD; length <= stored.length; length += PAD) {
    let plain: Uint8Array;
    try {
      plain = xchachaDecryptPacked(stored.subarray(0, length), key);
    } catch {
      continue;
    }
    return unframe(name, plain);
  }
  throw new RecordError("auth", `"${name}" does not open with this key`);
}

/** `bytes`, followed by random bytes up to `length`. */
export function lengthen(bytes: Uint8Array, length: number): Uint8Array {
  const out = randomBytes(length);
  out.set(bytes.subarray(0, length));
  return out;
}

export const wrapKey = (wrappingKey: Uint8Array, key: Uint8Array): Uint8Array => xchachaEncryptPacked(key, wrappingKey);

/** The wrapped key, or `null` if it does not open — which is also what a slot of random bytes does. */
export function unwrapKey(wrappingKey: Uint8Array, wrapped: Uint8Array): Uint8Array | null {
  try {
    const key = xchachaDecryptPacked(wrapped, wrappingKey);
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}
