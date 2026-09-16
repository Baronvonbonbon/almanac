#!/usr/bin/env node
/**
 * The test vectors for provider shares (app/src/share/vectors.json), computed *independently* of
 * app/src/share — which is the only thing that makes them worth having. Every derivation here is
 * written from docs/DESIGN.md §9 and the format comments, using other people's implementations:
 * Node's own X25519 and HKDF, @noble/ciphers for XChaCha20-Poly1305, @noble/hashes for BLAKE2b.
 * If this and share/ ever disagree, one of them has a bug, and the tests say so.
 *
 * The first version of these vectors was made by a script in a scratchpad, which is gone (see the
 * note it left in vectors.json). This one lives in the repo so the vectors can be checked, argued
 * with, and made again after a deliberate format change.
 *
 *   node tools/share-vectors.mjs           # print the vectors as JSON
 *   node tools/share-vectors.mjs --write   # write app/src/share/vectors.json
 *
 * The sealed share it writes is a fixture: XChaCha takes a random nonce, so it is sealed once, with
 * the nonces below, and must keep opening for ever after. Changing a format breaks it on purpose.
 */
import { createHash, createPrivateKey, createPublicKey, diffieHellman, hkdfSync, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { blake2b } from "@noble/hashes/blake2b";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";

const SALT = "almanac/v1";
const VERSION = 1;
const KIND = { pairing: 1, share: 2, approval: 3, request: 4, stop: 5 };
const ID_BYTES = 16;
const KEY_BYTES = 32;
const CID_BYTES = 32;
const NONCE_BYTES = 24;

const hex = (b) => Buffer.from(b).toString("hex");
const unhex = (s) => new Uint8Array(Buffer.from(s, "hex"));
const utf8 = (s) => new Uint8Array(Buffer.from(s, "utf8"));
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

// -- X25519, through Node rather than through share/ -------------------------------------------

/** A raw 32-byte X25519 secret, wrapped in the PKCS#8 the Node API insists on. */
const PKCS8_PREFIX = unhex("302e020100300506032b656e042204 20".replace(/\s/g, ""));
const privateFrom = (secret) => createPrivateKey({ key: Buffer.from(cat(PKCS8_PREFIX, secret)), format: "der", type: "pkcs8" });
/** The public half is the last 32 bytes of the SPKI encoding. */
const publicFromSecret = (secret) => new Uint8Array(createPublicKey(privateFrom(secret)).export({ format: "der", type: "spki" }).subarray(-32));

const SPKI_PREFIX = unhex("302a300506032b656e032100");
const publicFrom = (key) => createPublicKey({ key: Buffer.from(cat(SPKI_PREFIX, key)), format: "der", type: "spki" });
const dh = (secret, theirPublic) => new Uint8Array(diffieHellman({ privateKey: privateFrom(secret), publicKey: publicFrom(theirPublic) }));

/** HKDF-SHA256, 32 bytes out — what @parity/product-sdk-crypto's deriveKey does. */
const derive = (ikm, info) => new Uint8Array(hkdfSync("sha256", ikm, utf8(SALT), utf8(info), 32));

const pairKeys = (shared, senderKey, providerKey) => {
  const ikm = cat(shared, senderKey, providerKey);
  return {
    toProvider: derive(ikm, "share/to-provider"),
    toAlmanac: derive(ikm, "share/to-almanac"),
    requestTopic: derive(ikm, "share/request-topic"),
    answerTopic: derive(ikm, "share/answer-topic"),
    confirm: derive(ikm, "share/confirm"),
  };
};

const openingMask = (shared, senderKey, openingKey) => derive(cat(shared, senderKey, openingKey), "share/opening");
const digits = (h) => String(((((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0) % 1_000_000)).padStart(6, "0");
const checkDigits = (providerKey) => digits(derive(providerKey, "share/check"));

// -- Ed25519, likewise through Node -------------------------------------------------------------
// The only signatures in almanac: the registry vouching for a clinic, and the clinic signing the
// code it shows. Node takes a raw 32-byte seed the same way it takes an X25519 secret, wrapped.

const ED_PKCS8_PREFIX = unhex("302e020100300506032b657004220420");
const ED_SPKI_PREFIX = unhex("302a300506032b6570032100");
const edPrivate = (seed) => createPrivateKey({ key: Buffer.from(cat(ED_PKCS8_PREFIX, seed)), format: "der", type: "pkcs8" });
const edPublic = (seed) => new Uint8Array(createPublicKey(edPrivate(seed)).export({ format: "der", type: "spki" }).subarray(-32));
const edVerifyKey = (key) => createPublicKey({ key: Buffer.from(cat(ED_SPKI_PREFIX, key)), format: "der", type: "spki" });
const edSign = (message, seed) => new Uint8Array(sign(null, Buffer.from(message), edPrivate(seed)));

const TIER = { free: 1, licensed: 2 };
const NAME_HASH_BYTES = 8;
const nameHash = (name) => blake2b(utf8(name.trim()), { dkLen: 32 }).subarray(0, NAME_HASH_BYTES);

/** version | tier | expiry | the clinic's identity key | H(name), then the registry's signature. */
function attest({ tier, expires, identityKey, name }, registrySeed) {
  const body = cat(new Uint8Array([VERSION, TIER[tier]]), u32(seconds(expires)), identityKey, nameHash(name));
  return cat(body, edSign(body, registrySeed));
}

/** The clinic signs the two keys in its own code, so an attestation cannot be lifted into another. */
const signPairing = (providerKey, firstOpeningKey, clinicSeed) => edSign(cat(providerKey, firstOpeningKey), clinicSeed);

// -- base32, Crockford's alphabet, written from the format rather than imported -----------------

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function toBase32(bytes) {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return out;
}

// -- the formats -------------------------------------------------------------------------------

const seconds = (ms) => Math.floor(ms / 1000);
const u32 = (n) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n);
  return out;
};
const xor = (a, b) => a.map((v, i) => v ^ b[i]);
/** nonce ‖ ciphertext‖tag — what xchachaEncryptPacked packs. */
const seal = (plain, key, nonce) => cat(nonce, xchacha20poly1305(key, nonce).encrypt(plain));

/** version | kind | provider key | first opening key | attestation | clinic signature | name. */
function pairingCode(providerKey, firstOpeningKey, name, attestation, signature) {
  const n = utf8(name);
  return (
    "ALMANAC:P:" +
    toBase32(cat(new Uint8Array([VERSION, KIND.pairing]), providerKey, firstOpeningKey, attestation, signature, new Uint8Array([n.length]), n))
  );
}

/** kind | share id | opening key | until | the share's key, masked | the CID it opens. */
function approval({ id, openingKey, until, shareKey, mask, cid }) {
  return cat(new Uint8Array([KIND.approval]), id, openingKey, u32(seconds(until)), xor(shareKey, mask), cid);
}

/** version | kind | share id | almanac's key | end date. */
const shareHeader = (id, senderKey, ends) => cat(new Uint8Array([VERSION, KIND.share]), id, senderKey, u32(seconds(ends)));

const SHARE_BUCKETS = [2, 4, 8, 16].map((k) => k * 1024);

function sealShare({ header, approvalEntry, payload, shareKey, nonce }) {
  const overhead = NONCE_BYTES + 16;
  const fixed = header.length + approvalEntry.length + overhead;
  const size = SHARE_BUCKETS.find((b) => b >= fixed + header.length + 4 + payload.length);
  if (!size) throw new Error("more than a share can hold");
  const plain = new Uint8Array(size - fixed);
  plain.set(header);
  plain.set(u32(payload.length), header.length);
  plain.set(payload, header.length + 4);
  return cat(header, approvalEntry, seal(plain, shareKey, nonce));
}

// -- the vectors themselves ---------------------------------------------------------------------

const KEYS = {
  senderSecret: "d48a86e21950fbdd4e0e936fb2c5dd486275f961e3d63c28fa6b5cb8adac45bc",
  providerSecret: "d1d981601b77a6c1ca710f29da879e0f6e36fadf54be2e4e7837e5787c44176e",
  openingSecret: "8020a78d88515be046de072472d377525f0960137d59bc9b29a8433aaea229f8",
};

/**
 * The registry and the clinic of the vectors — the same fixed seeds as app/src/share/testing.ts, so
 * a code built there is byte-for-byte the one here. Demo keys, and nothing else: the real registry
 * key is in product.mjs, and its secret half is on nobody's phone.
 */
const REGISTRY_SEED = new Uint8Array(32).fill(7);
const CLINIC_SEED = new Uint8Array(32).fill(9);
/** Fixed, or the vector would change every time it was made. 2027-09-14. */
const ATTESTED_EXPIRES = 1821427200000;

// Fixed so the sealed share is the same every run. Any 24 bytes would do; these are not secret.
const SHARE_NONCE = unhex("1112131415161718191a1b1c1d1e1f202122232425262728");
const APPROVAL_NONCE = unhex("3132333435363738393a3b3c3d3e3f404142434445464748");

const SEALED = {
  id: "00112233445566778899aabbccddeeff",
  shareKey: "a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf",
  ends: 1789983000000,
  until: 1789379100000,
  selection: { from: "2026-03-01", to: "2026-09-14", periods: ["2026-08-17", "2026-09-13"], symptoms: { cramps: 4 } },
};

function build() {
  const senderSecret = unhex(KEYS.senderSecret);
  const providerSecret = unhex(KEYS.providerSecret);
  const openingSecret = unhex(KEYS.openingSecret);
  const senderPublic = publicFromSecret(senderSecret);
  const providerPublic = publicFromSecret(providerSecret);
  const openingPublic = publicFromSecret(openingSecret);

  const shared = dh(senderSecret, providerPublic);
  const bothWays = dh(providerSecret, senderPublic);
  if (hex(shared) !== hex(bothWays)) throw new Error("X25519 disagreed with itself");
  const pair = pairKeys(shared, senderPublic, providerPublic);

  const openingShared = dh(senderSecret, openingPublic);
  const mask = openingMask(openingShared, senderPublic, openingPublic);

  const id = unhex(SEALED.id);
  const shareKey = unhex(SEALED.shareKey);
  const header = shareHeader(id, senderPublic, SEALED.ends);
  const entry = seal(
    approval({ id, openingKey: openingPublic, until: SEALED.until, shareKey, mask, cid: new Uint8Array(CID_BYTES) }),
    pair.toProvider,
    APPROVAL_NONCE,
  );
  const share = sealShare({ header, approvalEntry: entry, payload: utf8(JSON.stringify(SEALED.selection)), shareKey, nonce: SHARE_NONCE });

  const registryPublic = edPublic(REGISTRY_SEED);
  const clinicPublic = edPublic(CLINIC_SEED);
  const attestation = attest({ tier: "licensed", expires: ATTESTED_EXPIRES, identityKey: clinicPublic, name: "Dr Okafor" }, REGISTRY_SEED);
  const pairingSignature = signPairing(providerPublic, openingPublic, CLINIC_SEED);
  // Checked here rather than taken on trust: a vector that doesn't verify is worse than none.
  if (!verify(null, Buffer.from(attestation.subarray(0, 46)), edVerifyKey(registryPublic), Buffer.from(attestation.subarray(46)))) {
    throw new Error("the attestation this file made does not verify against its own registry key");
  }
  if (!verify(null, Buffer.from(cat(providerPublic, openingPublic)), edVerifyKey(clinicPublic), Buffer.from(pairingSignature))) {
    throw new Error("the pairing signature this file made does not verify against its own clinic key");
  }

  return {
    note: "Computed independently of share/ by tools/share-vectors.mjs: Node's X25519 and HKDF, @noble/ciphers for XChaCha20-Poly1305, @noble/hashes for BLAKE2b, and a bit-string base32. If a test against these fails, shares made before no longer open.",
    keys: {
      senderSecret: KEYS.senderSecret,
      senderPublic: hex(senderPublic),
      providerSecret: KEYS.providerSecret,
      providerPublic: hex(providerPublic),
      openingSecret: KEYS.openingSecret,
      openingPublic: hex(openingPublic),
      shared: hex(shared),
      toProvider: hex(pair.toProvider),
      toAlmanac: hex(pair.toAlmanac),
      requestTopic: hex(pair.requestTopic),
      answerTopic: hex(pair.answerTopic),
      confirm: hex(pair.confirm),
      check: checkDigits(providerPublic),
      pairCheck: digits(pair.confirm),
      openingShared: hex(openingShared),
      openingMask: hex(mask),
    },
    channels: {
      sharing: hex(blake2b(utf8("almanac/v1/sharing"), { dkLen: 32 })),
      requests: hex(blake2b(utf8("almanac/v1/provider-requests"), { dkLen: 32 })),
    },
    pairing: {
      name: "Dr Okafor",
      expires: ATTESTED_EXPIRES,
      tier: "licensed",
      registryPublic: hex(registryPublic),
      clinicPublic: hex(clinicPublic),
      attestation: hex(attestation),
      signature: hex(pairingSignature),
      code: pairingCode(providerPublic, openingPublic, "Dr Okafor", attestation, pairingSignature),
    },
    base32: base32Vectors(),
    sealed: {
      note: "Sealed once by tools/share-vectors.mjs with the keys and nonces above (2026-09-16, when an approval grew a CID): it must keep opening.",
      ...SEALED,
      share: hex(share),
    },
  };
}

/** Kept from the first vectors, and checked here against this file's own encoder. */
function base32Vectors() {
  const path = fileURLToPath(new URL("../app/src/share/vectors.json", import.meta.url));
  const previous = JSON.parse(readFileSync(path, "utf8"));
  for (const v of previous.base32) {
    const made = toBase32(unhex(v.bytes));
    if (made !== v.text) throw new Error(`base32 disagrees on ${v.bytes}: ${made} vs ${v.text}`);
  }
  return previous.base32;
}

const vectors = build();
const json = JSON.stringify(vectors, null, 2) + "\n";
if (process.argv.includes("--write")) {
  const path = fileURLToPath(new URL("../app/src/share/vectors.json", import.meta.url));
  writeFileSync(path, json);
  console.log(`wrote ${path}`);
  console.log(`  sealed share: ${vectors.sealed.share.length / 2} bytes, sha256 ${createHash("sha256").update(unhex(vectors.sealed.share)).digest("hex").slice(0, 16)}…`);
  console.log(`  first check ${vectors.keys.check}, second check ${vectors.keys.pairCheck}`);
} else {
  process.stdout.write(json);
}
