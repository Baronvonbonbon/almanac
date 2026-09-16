#!/usr/bin/env node
/**
 * The provider demo, end to end (docs/DESIGN.md §9).
 *
 * Two halves, and the first is the one that catches breakage:
 *
 *   1. **A headless proof.** It runs the whole exchange against `app/src/share` itself — the real
 *      code both apps bundle, not a re-implementation — using the **real** registry key from
 *      product.mjs. Mint a clinic key, have the registry vouch for it, build the pairing code,
 *      have almanac verify and refuse the ways it should, make a share, read it back, and check both
 *      sides land on the same six digits. If this passes, the flow works.
 *   2. **The walkthrough.** It prints the steps to run the same thing on real devices.
 *
 * The clinic's key cannot be minted here for a real walkthrough: the provider app makes its own at
 * setup and shows the public half, because a registration is issued *for a key on a device*. So pass
 * that key back in to have the registry vouch for it:
 *
 *   node tools/demo.mjs                                  # prove the flow, then print the steps
 *   node tools/demo.mjs --key <hex> --name "Dr Okafor"   # …and vouch for a real device's key
 *
 * Signing: the registry's secret at ~/.config/almanac/registry-key (tools/registry-key.mjs), which is
 * the only key this uses. Nothing is sent anywhere and nothing is paid: an attestation is a signature,
 * not a transaction. The deploy key is for publishing (tools/deploy.mjs) and is untouched here.
 */
import { build } from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REGISTRY_PUBLIC_KEY } from "../product.mjs";

const SECRET = join(homedir(), ".config", "almanac", "registry-key");
const DAY = 86_400_000;

const hex = (b) => Buffer.from(b).toString("hex");
const unhex = (s) => new Uint8Array(Buffer.from(s, "hex"));
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

let failures = 0;
function ok(condition, what) {
  console.log(`  ${condition ? "✓" : "✗"} ${what}`);
  if (!condition) failures++;
}
/** Runs `fn` and returns the ShareError problem it threw, or null if it did not throw one. */
function refused(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    return e?.problem ?? `threw ${e?.message ?? e}`;
  }
}

/**
 * app/src/share, bundled so a plain .mjs can use it. There is no tsx here, and re-implementing the
 * formats would defeat the point — share-vectors.mjs does that deliberately, for vectors; this must
 * exercise the very code the apps ship.
 */
async function loadShare() {
  const dir = await mkdtemp(join(tmpdir(), "almanac-demo-"));
  const outfile = join(dir, "share.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../app/src/share/index.ts", import.meta.url))],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    external: ["node:*"],
    // tweetnacl is CommonJS and reaches for require("crypto") as it loads, to seed its PRNG. An ESM
    // bundle has no require, and esbuild's shim throws rather than guess — so hand it a real one.
    // The shim checks `typeof require !== "undefined"` first, so defining it here is enough.
    banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
    logLevel: "warning",
  });
  const share = await import(pathToFileURL(outfile).href);
  return { share, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const SELECTION = {
  v: 1,
  from: "2026-03-15",
  to: "2026-09-15",
  made: "2026-09-15",
  categories: ["periods", "symptoms"],
  days: { "2026-09-01": { flow: "heavy", symptoms: ["cramps"] } },
  cycles: [{ start: "2026-09-01" }],
};

if (!existsSync(SECRET)) {
  console.error(`No registry key at ${SECRET}. Make one with:\n  node tools/registry-key.mjs`);
  process.exit(1);
}

const { share, cleanup } = await loadShare();
const {
  attest,
  newSigningKeyPair,
  signPairing,
  pairingCode,
  readPairingCode,
  verifyProvider,
  REGISTRY_KEY,
  newKeyPair,
  newShare,
  sealShare,
  readShare,
  openStored,
  unmaskShareKey,
  encodeSelection,
  decodeSelection,
  toFrames,
  joinFrames,
  readFrame,
  almanacPair,
  pairDigits,
  checkDigits,
} = share;

try {
  const registry = { secretKey: unhex(readFileSync(SECRET, "utf8").trim()) };
  registry.publicKey = registry.secretKey.slice(32);

  console.log("\nThe registry\n");
  ok(hex(registry.publicKey) === REGISTRY_PUBLIC_KEY, "the secret at ~/.config/almanac/registry-key is the one product.mjs publishes");
  ok(hex(REGISTRY_KEY) === REGISTRY_PUBLIC_KEY, "the key built into the app's bundle is that same key");
  if (failures) {
    console.error("\nThe registry key on this computer is not the one the apps trust. Nothing below would mean anything.");
    process.exit(1);
  }

  const now = Date.now();
  const name = "Dr Okafor, Riverside Clinic";
  const clinic = newSigningKeyPair();
  const attestation = attest({ tier: "licensed", expires: now + 30 * DAY, identityKey: clinic.publicKey, name }, registry.secretKey);

  console.log("\nThe registry vouches for a clinic\n");
  const provider = newKeyPair();
  const firstOpening = newKeyPair();
  const pairing = {
    providerKey: provider.publicKey,
    firstOpeningKey: firstOpening.publicKey,
    attestation,
    signature: signPairing(clinic.secretKey, provider.publicKey, firstOpening.publicKey),
    name,
  };
  const code = pairingCode(pairing);
  ok(code.startsWith("ALMANAC:P:"), `the clinic can show a pairing code (${code.length} characters, one QR)`);

  console.log("\nalmanac reads the code and decides whether to believe it\n");
  const scanned = readPairingCode(code);
  const believed = verifyProvider(scanned, { registryKey: REGISTRY_KEY, now });
  ok(believed.tier === "licensed", `almanac believes it, and sees the tier (${believed.tier})`);
  ok(scanned.name === name, "the name almanac shows is the one the registry vouched for");
  ok(scanned.check === checkDigits(provider.publicKey), `the first six digits match on both screens (${scanned.check})`);

  console.log("\n…and refuses what it should\n");
  const stranger = newSigningKeyPair();
  const notVouched = { ...pairing, attestation: attest({ tier: "licensed", expires: now + 30 * DAY, identityKey: clinic.publicKey, name }, stranger.secretKey) };
  ok(refused(() => verifyProvider(readPairingCode(pairingCode(notVouched)), { registryKey: REGISTRY_KEY, now })) === "untrusted", "a clinic no registry vouched for");

  const wrongName = { ...pairing, attestation: attest({ tier: "licensed", expires: now + 30 * DAY, identityKey: clinic.publicKey, name: "Someone Else" }, registry.secretKey) };
  ok(refused(() => verifyProvider(readPairingCode(pairingCode(wrongName)), { registryKey: REGISTRY_KEY, now })) === "untrusted", "an attestation shown under another name");

  const thief = newSigningKeyPair();
  const lifted = { ...pairing, signature: signPairing(thief.secretKey, provider.publicKey, firstOpening.publicKey) };
  ok(refused(() => verifyProvider(readPairingCode(pairingCode(lifted)), { registryKey: REGISTRY_KEY, now })) === "untrusted", "a real attestation lifted into someone else's code");

  const ranOut = { ...pairing, attestation: attest({ tier: "free", expires: now - DAY, identityKey: clinic.publicKey, name }, registry.secretKey) };
  ok(refused(() => verifyProvider(readPairingCode(pairingCode(ranOut)), { registryKey: REGISTRY_KEY, now })) === "expired", "a registration that has run out — and says so, rather than 'untrusted'");

  console.log("\nThe patient shares, and the clinic reads it\n");
  const payload = await encodeSelection(SELECTION);
  const made = newShare(now + 7 * DAY, payload);
  const sealed = sealShare(made, scanned, now + 15 * 60_000);
  const frames = toFrames(sealed);
  ok(frames.length >= 1, `almanac shows the share as ${frames.length} code${frames.length === 1 ? "" : "s"}`);

  // Read the way a camera does: every frame, through the same parser the provider app uses.
  const rejoined = joinFrames(frames.map(readFrame));
  ok(rejoined !== null && Buffer.from(rejoined).equals(Buffer.from(sealed)), "the codes go back together into exactly what was sealed");

  const received = readShare(rejoined, provider);
  const shareKey = unmaskShareKey(received.firstApproval, firstOpening, received.header.senderKey);
  const opened = await decodeSelection(openStored(received.stored, shareKey).payload);
  ok(JSON.stringify(opened) === JSON.stringify(SELECTION), "the clinic opens exactly what the patient chose");

  console.log("\nThe second check\n");
  const mine = pairDigits(almanacPair(made.sender, scanned.providerKey));
  const theirs = pairDigits(received.pair);
  ok(mine === theirs, `both screens show the same six digits (${mine})`);
  ok(mine !== scanned.check, "and they are not the digits on the provider's code — these need both phones' keys");

  console.log(`\n${failures ? `${failures} check(s) FAILED` : "Every check passed."}\n`);

  // -- the walkthrough --------------------------------------------------------------------------

  const forKey = arg("--key");
  const forName = arg("--name");

  if (forKey) {
    if (!forName) {
      console.error('--key needs --name too: the name is bound into the attestation, and must be exactly what was typed into the provider app.');
      process.exit(2);
    }
    const identityKey = unhex(forKey);
    if (identityKey.length !== 32) {
      console.error("--key is not a 32-byte identity key. Copy the whole line the provider app showed.");
      process.exit(2);
    }
    const days = Number(arg("--days", "30"));
    const tier = arg("--tier", "free");
    const real = attest({ tier, expires: Date.now() + days * DAY, identityKey, name: forName }, registry.secretKey);
    console.log(`Vouched for "${forName}" as ${tier}, for ${days} days.\n`);
    console.log("Paste this into the provider app's registration step:\n");
    console.log(`  ${hex(real)}\n`);
  } else {
    console.log("To walk it through on real devices:\n");
    console.log("  1. Open the provider app and start setup. Type the clinic name patients will see.");
    console.log("  2. It shows the clinic's key. Copy that line — it made the key itself, and a");
    console.log("     registration is issued for a key on a device.");
    console.log("  3. Here, have the registry vouch for it — the name must match exactly:\n");
    console.log('       node tools/demo.mjs --key <the key it showed> --name "<the name you typed>"\n');
    console.log("  4. Paste what that prints into the provider app, and finish setup with a PIN.");
    console.log("  5. New patient → show the code. Open almanac → Settings → Sharing → Share with a");
    console.log("     provider, and scan it. almanac checks the registration before anything else.");
    console.log("  6. Check the name and the first six digits match on both screens, choose what to");
    console.log("     share, and show the codes for the provider app to read.");
    console.log("  7. Check the *second* six digits match. The provider app keeps nothing until you");
    console.log("     confirm they do.\n");
    console.log("  An unregistered clinic can show no code at all, so step 3 is not optional.\n");
  }
} finally {
  await cleanup();
}

process.exit(failures ? 1 : 0);
