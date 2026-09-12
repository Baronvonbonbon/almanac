import { blake2b256 } from "@parity/product-sdk-crypto";

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

export const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** crypto.getRandomValues refuses more than 64 KiB per call. */
export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65_536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65_536)));
  return out;
}

export const kib = (n: number): string => (n >= 1_048_576 ? `${n / 1_048_576} MiB` : `${n / 1024} KiB`);

export const since = (t0: number): number => Math.round(performance.now() - t0);

export const day = (ms: number): string => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

export function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  const s = JSON.stringify(e);
  return s && s !== "{}" ? s.slice(0, 300) : String(e);
}

/**
 * Host calls can stall rather than reject — kite lost a session to an upload that never settled.
 * Everything that crosses to the host goes through this.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: no answer in ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * A short, shareable fingerprint of secret bytes. Hashed first, so a report can be posted publicly
 * without leaking the secret: comparing fingerprints is enough to tell "same" from "different".
 */
export function fingerprint(secret: Uint8Array): string {
  return hex(blake2b256(secret).slice(0, 8)).replace(/(.{4})(?!$)/g, "$1 ");
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error(`not base58: "${c}"`);
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/** The 32-byte public key inside an SS58 address. The checksum is not verified — this is a probe. */
export function ss58PublicKey(address: string): Uint8Array {
  const raw = base58Decode(address);
  const prefixLength = raw[0] & 0b0100_0000 ? 2 : 1;
  if (raw.length !== prefixLength + 32 + 2) throw new Error(`unexpected SS58 length ${raw.length}`);
  return raw.slice(prefixLength, prefixLength + 32);
}

export const short = (s: string): string => (s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s);
