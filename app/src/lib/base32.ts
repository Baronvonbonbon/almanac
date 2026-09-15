/**
 * Crockford's base32 for bytes of any length: digits and capital letters, without I, L, O or U — the
 * characters a QR code packs most tightly, 5.5 bits each against 8 for anything else. Reading ignores
 * case.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function toBase32(bytes: Uint8Array): string {
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(acc >>> bits) & 31];
    }
    acc &= (1 << bits) - 1;
  }
  // The last few bits, padded with zeros to a whole character.
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 31];
  return out;
}

export function fromBase32(s: string): Uint8Array {
  const out = new Uint8Array(Math.floor((s.length * 5) / 8));
  let acc = 0;
  let bits = 0;
  let at = 0;
  for (const c of s.toUpperCase()) {
    const v = ALPHABET.indexOf(c);
    if (v < 0) throw new SyntaxError("not base32");
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (acc >>> bits) & 0xff;
      acc &= (1 << bits) - 1;
    }
  }
  // What is left over must be the zeros toBase32 padded with: anything else was never written by it.
  if (bits >= 5 || acc !== 0) throw new SyntaxError("not base32");
  return out;
}
