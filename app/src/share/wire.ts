/** The pieces every provider-share message is built from (docs/DESIGN.md §9, provider shares). */

export const VERSION = 1;
export const KIND = { pairing: 1, share: 2, approval: 3, request: 4, stop: 5 } as const;
export const ID_BYTES = 16;
export const KEY_BYTES = 32;
/** A nonce and a tag: what XChaCha20-Poly1305 adds to what it seals. */
export const SEAL_OVERHEAD = 24 + 16;

/** Times travel as whole seconds in 32 bits, which lasts until 2106. */
export function seconds(ms: number): number {
  const s = Math.floor(ms / 1000);
  if (!(s >= 0 && s <= 0xffffffff)) throw new RangeError("a time almanac cannot send");
  return s;
}

export function putU32(out: Uint8Array, at: number, n: number): void {
  new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(at, n);
}

export const getU32 = (bytes: Uint8Array, at: number): number => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at);

/** Compares every byte, whatever the first difference, so the time taken says nothing. */
export function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) throw new RangeError("xor of different lengths");
  return a.map((v, i) => v ^ b[i]);
}
