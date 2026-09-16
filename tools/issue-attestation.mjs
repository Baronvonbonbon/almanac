#!/usr/bin/env node
/**
 * The registry vouching for a clinic (docs/DESIGN.md §9, provider registration).
 *
 * Approval comes first and is a decision, not a command: somebody entitled to say that a clinic is a
 * clinic has looked at its credentials. This tool is only the last step — signing what that decision
 * means, so a phone can check it with no network at the visit.
 *
 *   node tools/issue-attestation.mjs --new
 *       make a clinic an identity key pair; its secret goes into the provider app, once
 *
 *   node tools/issue-attestation.mjs --key <identity public key> --name "Dr Okafor" [--tier free|licensed] [--days 30]
 *       sign an attestation for that clinic, and print it for the provider app to paste in
 *
 * The tier is what the clinic is entitled to today: `free` is an approved clinic of one seat, which
 * is also where a lapsed licence lands; `licensed` is a clinic that has paid. Approval is what makes
 * either possible, and neither is issued to a clinic that has not been approved.
 *
 * Attestations are short lived on purpose — that is how a revoked clinic stops working without
 * anyone having to reach its device (THREAT-MODEL R13). Thirty days by default.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { blake2b256, nacl, utf8ToBytes } from "@parity/product-sdk-crypto";

const SECRET = join(homedir(), ".config", "almanac", "registry-key");
const TIER = { free: 1, licensed: 2 };
const VERSION = 1;
const NAME_HASH_BYTES = 8;
const BODY_BYTES = 1 + 1 + 4 + 32 + NAME_HASH_BYTES;

const hex = (b) => Buffer.from(b).toString("hex");
const unhex = (s) => new Uint8Array(Buffer.from(s, "hex"));

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv.includes("--new")) {
  const pair = nacl.sign.keyPair();
  console.log("A clinic's identity key pair. The secret half goes into the provider app, once, and");
  console.log("never leaves it; the public half is what the registry vouches for.\n");
  console.log(`  public   ${hex(pair.publicKey)}`);
  console.log(`  secret   ${hex(pair.secretKey)}`);
  process.exit(0);
}

const key = arg("--key");
const name = arg("--name");
const tier = arg("--tier", "licensed");
const days = Number(arg("--days", "30"));

if (!key || !name) {
  console.error("Usage: node tools/issue-attestation.mjs --key <identity public key> --name \"Dr Okafor\" [--tier free|licensed] [--days 30]");
  console.error("   or: node tools/issue-attestation.mjs --new");
  process.exit(2);
}
if (!TIER[tier]) {
  console.error(`--tier must be "free" or "licensed"; got "${tier}"`);
  process.exit(2);
}
if (!existsSync(SECRET)) {
  console.error(`No registry key at ${SECRET}. Make one with:\n  node tools/registry-key.mjs`);
  process.exit(1);
}

const identity = unhex(key);
if (identity.length !== 32) {
  console.error("--key is not a 32-byte Ed25519 public key");
  process.exit(2);
}
if (!Number.isFinite(days) || days <= 0 || days > 365) {
  console.error("--days must be a number of days between 1 and 365; an attestation is meant to be short lived");
  process.exit(2);
}

const registry = nacl.sign.keyPair.fromSecretKey(unhex(readFileSync(SECRET, "utf8").trim()));
const expires = Math.floor(Date.now() / 1000) + days * 86_400;

const body = new Uint8Array(BODY_BYTES);
body[0] = VERSION;
body[1] = TIER[tier];
new DataView(body.buffer).setUint32(2, expires);
body.set(identity, 6);
body.set(blake2b256(utf8ToBytes(name.trim())).subarray(0, NAME_HASH_BYTES), 38);

const attestation = new Uint8Array(BODY_BYTES + 64);
attestation.set(body);
attestation.set(nacl.sign.detached(body, registry.secretKey), BODY_BYTES);

console.log(`Vouched for "${name.trim()}" as ${tier}, until ${new Date(expires * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC.\n`);
console.log("Paste this into the provider app:\n");
console.log(`  ${hex(attestation)}\n`);
console.log("It stops working on that date. Issue another to renew, and do not issue one to a clinic");
console.log("whose approval has been withdrawn — that is what revoking is.");
