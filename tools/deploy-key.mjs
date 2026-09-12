// A deploy key kept on this computer, for publishing without `pad login`.
//
// Why it exists: on 2026-09-11 `pad login` could not pair with the Polkadot app — the phone said
// "Mode BIGINT is not implemented". paritytech/polkadot-app-deploy#231 reports the same failure on iOS
// 0.9.2, and confirms that deploying with a separate mnemonic works. The key then owns the .dot name
// until `pad transfer <name>.dot --to <your phone account's H160>` hands it over.
//
// The words are written once to KEY_FILE (mode 600, outside the repo) and never printed. Only the
// address to fund is shown.
//
// Usage, from the repo root:
//   npm run deploy-key                    create the key if there is none, and print its address
//   node tools/deploy-key.mjs --check     only check the derivation still matches pad's (CI)

import { keccak_256 } from "@noble/hashes/sha3.js";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  generateMnemonic,
  mnemonicToEntropy,
  ss58Address,
} from "@polkadot-labs/hdkd-helpers";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const KEY_FILE = process.env.ALMANAC_DEPLOY_KEY ?? join(homedir(), ".config", "almanac", "deploy-key");

/** The root sr25519 account of a mnemonic — no derivation path, as pad's keyring.addFromMnemonic uses it. */
export function accountOf(mnemonic) {
  const words = mnemonic.trim().split(/\s+/).join(" ");
  const { publicKey } = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(words)))("");
  // pallet-revive maps a non-Ethereum AccountId32 to the last 20 bytes of its keccak-256.
  const h160 = `0x${Buffer.from(keccak_256(publicKey).slice(12)).toString("hex")}`;
  return { ss58: ss58Address(publicKey), h160 };
}

// Checked against pad's own output: with its default key (the public dev phrase) its preflight printed
// SS58 5DfhGy… and H160 0x35cd… on 2026-09-11. If this derivation ever disagrees with pad's, the address
// shown for funding would be the wrong one — so refuse rather than print it.
const dev = accountOf(DEV_PHRASE);
if (dev.ss58 !== "5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV" || dev.h160 !== "0x35cdb23ff7fc86e8dccd577ca309bfea9c978d20") {
  throw new Error(`deploy-key: derivation no longer matches pad's (${dev.ss58} / ${dev.h160})`);
}

export function readKey() {
  return existsSync(KEY_FILE) ? readFileSync(KEY_FILE, "utf8").trim() : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--check")) {
    console.log("deploy-key: derivation matches pad's");
    process.exit(0);
  }
  let mnemonic = readKey();
  if (mnemonic) {
    console.log(`Using the deploy key in ${KEY_FILE}.`);
  } else {
    mkdirSync(dirname(KEY_FILE), { recursive: true, mode: 0o700 });
    mnemonic = generateMnemonic(256);
    writeFileSync(KEY_FILE, `${mnemonic}\n`, { mode: 0o600, flag: "wx" });
    console.log(`Created a deploy key in ${KEY_FILE}, readable only by you. Its words are not shown.`);
  }
  const { ss58, h160 } = accountOf(mnemonic);
  console.log(`\n  Address  ${ss58}\n  H160     ${h160}\n`);
  console.log("Fund the address with test PAS on Paseo Asset Hub (faucet.polkadot.io). Registering a name costs about 10 PAS.");
  console.log("Back the key file up somewhere safe: it owns the .dot name until you transfer it.");
}
