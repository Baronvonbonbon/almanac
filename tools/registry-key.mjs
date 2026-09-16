#!/usr/bin/env node
/**
 * The demo registry's signing key (docs/DESIGN.md §9, provider registration).
 *
 * The registry vouches for a clinic by signing an attestation, and almanac checks it against the
 * public half, which is built into the bundle. So this key pair decides who almanac will make a
 * share for, and the secret half never belongs on a phone or in a bundle — only wherever
 * attestations are issued.
 *
 *   node tools/registry-key.mjs            # make one; writes the secret outside the repo
 *   node tools/registry-key.mjs --show     # print the public half of the one already made
 *
 * The secret goes to ~/.config/almanac/registry-key, readable only by you, the same way the deploy
 * key does (tools/deploy-key.mjs). It is never printed.
 *
 * **This is a demo registry.** A real one would be held by whoever is entitled to say that a clinic
 * is a clinic — a medical board, or an accreditation body — not by whoever builds the app.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { nacl } from "@parity/product-sdk-crypto";

const PATH = join(homedir(), ".config", "almanac", "registry-key");
const hex = (b) => Buffer.from(b).toString("hex");

function read() {
  const secret = new Uint8Array(Buffer.from(readFileSync(PATH, "utf8").trim(), "hex"));
  if (secret.length !== 64) throw new Error(`${PATH} does not hold an Ed25519 secret key`);
  return nacl.sign.keyPair.fromSecretKey(secret);
}

if (process.argv.includes("--show")) {
  if (!existsSync(PATH)) {
    console.error(`No registry key yet. Make one with:\n  node tools/registry-key.mjs`);
    process.exit(1);
  }
  console.log(hex(read().publicKey));
  process.exit(0);
}

if (existsSync(PATH)) {
  console.log(`A registry key already exists at ${PATH}`);
  console.log(`Its public half is:\n  ${hex(read().publicKey)}`);
  console.log(`\nMaking a new one would stop every attestation the old one signed from verifying.`);
  console.log(`Delete that file yourself if that is what you mean to do.`);
  process.exit(0);
}

const pair = nacl.sign.keyPair();
mkdirSync(dirname(PATH), { recursive: true });
writeFileSync(PATH, hex(pair.secretKey) + "\n", { mode: 0o600 });
chmodSync(PATH, 0o600);
console.log(`Wrote the registry's secret key to ${PATH} (readable only by you).`);
console.log(`\nIts public half — put this in product.mjs as REGISTRY_PUBLIC_KEY:\n  ${hex(pair.publicKey)}`);
console.log(`\nBack the file up. Without it no new provider can be vouched for, and every clinic`);
console.log(`stops being able to pair as its attestation runs out.`);
