export { bytesToHex as hex, hexToBytes as fromHex } from "@parity/product-sdk-crypto";

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

export const text = (b: Uint8Array): string => new TextDecoder().decode(b);
