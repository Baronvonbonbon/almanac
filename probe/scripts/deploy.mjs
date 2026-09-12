// Publish the probe to its .dot label with pad.
//
// Interactive on purpose. Once the name is owned, re-linking it needs a phone signature and pad reads
// the confirmation from this terminal: a closed stdin aborts, and `yes |` answers before the phone
// has anything to sign (broadside/docs/DEPLOY.md).
//
// And the first publish REGISTERS the name, permanently — DotNS entries cannot be deleted, renamed
// or reassigned. So this asks for the label to be typed back before doing anything.

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { CLOUD_ENV, DOT_NAME } from "../product.mjs";
import { KEY_FILE, accountOf, readKey } from "./deploy-key.mjs";

const PAD = "@polkadot-community-foundation/polkadot-app-deploy@0.16.1";
const root = resolve(import.meta.dirname, "..");

function newest(path) {
  const s = statSync(path);
  if (!s.isDirectory()) return s.mtimeMs;
  return Math.max(0, ...readdirSync(path).map((f) => newest(join(path, f))));
}

let built;
try {
  built = statSync(join(root, "dist/index.html")).mtimeMs;
} catch {
  console.error("refusing: no dist/ — run `npm run build` first");
  process.exit(1);
}
const sources = Math.max(newest(join(root, "src")), newest(join(root, "product.mjs")), newest(join(root, "index.html")));
if (sources > built) {
  console.error("refusing: dist/ is older than its sources — rebuild first");
  process.exit(1);
}

if (!process.stdin.isTTY) {
  console.error("refusing: run this in an interactive terminal — pad may need to wait for your phone");
  process.exit(1);
}

// Who will own the name. An explicit MNEMONIC wins; otherwise the local deploy key (deploy-key.mjs),
// if one exists; otherwise pad's login session. pad reads MNEMONIC from the environment and then
// ignores the session entirely.
const key = process.env.MNEMONIC ?? readKey();
const env = key ? { ...process.env, MNEMONIC: key } : process.env;

if (key) {
  const { ss58, h160 } = accountOf(key);
  console.log(`\nOwner: ${process.env.MNEMONIC ? "MNEMONIC" : `deploy key (${KEY_FILE})`} — ${ss58} / ${h160}`);
} else {
  // Without a key, everything rides on the login session, and two states of it are traps (2026-09-11):
  //  - unreadable: pad believes it is signing through the phone but never reaches it — no prompt, a
  //    silent transaction watcher, a re-sign, and a timeout about thirteen minutes later;
  //  - absent: pad falls back to its default key, the public dev phrase, which would register the
  //    name and keep it — a permanent label anyone can take over.
  const who = spawnSync("npx", ["--yes", PAD, "whoami", "--env", CLOUD_ENV], { cwd: root, encoding: "utf8" });
  const whoText = `${who.stdout ?? ""}${who.stderr ?? ""}`.trim();
  console.log(`\n${whoText}`);
  if (/could not be read|expired/i.test(whoText)) {
    console.error("\nrefusing: pad's login session is not usable. Run `npm run pad:logout -w probe`, then `npm run pad:login -w probe`.");
    process.exit(1);
  }
  if (/not logged in/i.test(whoText)) {
    console.error(
      "\nrefusing: not signed in and no deploy key, so pad would register the name to its public dev key." +
        "\nSign in (`npm run pad:login -w probe`) or create a deploy key (`npm run deploy-key -w probe`).",
    );
    process.exit(1);
  }
}

console.log(`\nThis publishes ./dist to ${DOT_NAME} on ${CLOUD_ENV}.`);
console.log(`If ${DOT_NAME} is not yours yet, pad will REGISTER it — permanently.\n`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const typed = (await rl.question(`Type ${DOT_NAME} to continue: `)).trim();
rl.close();
if (typed !== DOT_NAME) {
  console.error("aborted");
  process.exit(1);
}

// npx, not pnpm dlx: pad imports @polkadot-api/json-rpc-provider without declaring it, which npm's
// flat node_modules satisfies and pnpm's strict layout refuses.
const r = spawnSync("npx", ["--yes", PAD, "./dist", DOT_NAME, "--env", CLOUD_ENV, "--js-merkle"], {
  cwd: root,
  env,
  stdio: "inherit",
});
process.exit(r.status ?? 1);
