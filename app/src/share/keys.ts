import { concatBytes, deriveKey, nacl } from "@parity/product-sdk-crypto";
import { ShareError } from "./errors";

/**
 * Keys for provider shares (docs/DESIGN.md §9). Each pairing and each share has an X25519 key pair
 * made for it alone. The two meet in the pair key, which gives the keys that seal what passes between
 * almanac and the provider app, and the topics it passes on. Every derivation here is load-bearing —
 * changing one means no share made before it opens — which is why keys.test.ts pins them to vectors
 * computed independently.
 */

const SALT = "almanac/v1";

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export const newKeyPair = (): KeyPair => nacl.box.keyPair();

export const keyPairFrom = (secretKey: Uint8Array): KeyPair => nacl.box.keyPair.fromSecretKey(secretKey);

/** X25519. A key that would make the result all zeros — the same for everyone — is refused. */
export function dh(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  const shared = nacl.scalarMult(secretKey, publicKey);
  if (shared.every((b) => b === 0)) throw new ShareError("format", "not a usable key");
  return shared;
}

export interface PairKeys {
  /** Seals approvals and stops, almanac → provider app. */
  toProvider: Uint8Array;
  /** Seals requests, provider app → almanac. */
  toAlmanac: Uint8Array;
  /** The topic the provider app's requests go out on, which almanac listens to. */
  requestTopic: Uint8Array;
  /** The topic almanac's answers go out on, which the provider app listens to. */
  answerTopic: Uint8Array;
}

/** From the shared secret and both public keys: each side derives the same, and nobody else can. */
export function pairKeys(shared: Uint8Array, senderKey: Uint8Array, providerKey: Uint8Array): PairKeys {
  const ikm = concatBytes(shared, senderKey, providerKey);
  return {
    toProvider: deriveKey(ikm, SALT, "share/to-provider"),
    toAlmanac: deriveKey(ikm, SALT, "share/to-almanac"),
    requestTopic: deriveKey(ikm, SALT, "share/request-topic"),
    answerTopic: deriveKey(ikm, SALT, "share/answer-topic"),
  };
}

/** almanac's side of the pair key: the share's own key pair, and the key in the provider's code. */
export const almanacPair = (sender: KeyPair, providerKey: Uint8Array): PairKeys =>
  pairKeys(dh(sender.secretKey, providerKey), sender.publicKey, providerKey);

/** The provider app's side: its key pair for this pairing, and the key in the share. */
export const providerPair = (provider: KeyPair, senderKey: Uint8Array): PairKeys =>
  pairKeys(dh(provider.secretKey, senderKey), senderKey, provider.publicKey);

/** Six digits from the provider's key, shown on both screens: a swapped code shows others. */
export function checkDigits(providerKey: Uint8Array): string {
  const h = deriveKey(providerKey, SALT, "share/check");
  const n = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
  return String(n % 1_000_000).padStart(6, "0");
}

/**
 * What hides the share's key inside an approval. It takes the secret half of the opening key, or of
 * the share's own key pair, to work out — so an approval kept after its opening, or read off the
 * statement store later, opens nothing once the provider app has dropped the opening key.
 */
export function openingMask(shared: Uint8Array, senderKey: Uint8Array, openingKey: Uint8Array): Uint8Array {
  return deriveKey(concatBytes(shared, senderKey, openingKey), SALT, "share/opening");
}
