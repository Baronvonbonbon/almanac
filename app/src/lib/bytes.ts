export { bytesToHex as hex, hexToBytes as fromHex } from "@parity/product-sdk-crypto";

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

export const text = (b: Uint8Array): string => new TextDecoder().decode(b);

/** Base64 with `-` and `_`, unpadded — safe in notes, emails and links. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array {
  if (/[^A-Za-z0-9_-]/.test(s)) throw new SyntaxError("not base64url");
  const binary = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
